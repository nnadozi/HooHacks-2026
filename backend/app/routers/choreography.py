import logging
import os
import tempfile

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import choreographies_collection, moves_collection
from app.services.audio import detect_bpm
from app.services.choreography import assemble_sequence, create_synthetic_moves
from app.services.cv import extract_keypoints, get_video_fps
from app.services.scoring import normalize_keypoints, cosine_similarity
from app.services.storage import upload_bytes

logger = logging.getLogger("justdance.choreography")
router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"

VIDEO_MIME_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


@router.post("/generate")
async def generate_choreography(
    file: UploadFile, difficulty: str = "medium", seed: int | None = None
):
    user_id = DEV_USER_ID
    is_video = file.content_type in VIDEO_MIME_TYPES
    logger.info(
        "Generate request: file=%s, type=%s, is_video=%s, difficulty=%s",
        file.filename, file.content_type, is_video, difficulty,
    )

    # Read file
    contents = await file.read()
    if len(contents) > settings.max_upload_bytes:
        logger.warning("Upload too large: %d bytes", len(contents))
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                "code": "UPLOAD_TOO_LARGE",
            },
        )

    # Upload to storage
    try:
        file_uri = await upload_bytes(
            contents, file.filename or "upload", file.content_type or "application/octet-stream"
        )
        logger.info("Uploaded to storage: %s", file_uri)
    except Exception as e:
        logger.error("Storage upload failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": f"Failed to upload file: {e}", "code": "STORAGE_ERROR"},
        )

    # Detect BPM
    try:
        bpm = detect_bpm(contents, file.filename or "", file.content_type or "")
        logger.info("Detected BPM: %d", bpm)
    except Exception as e:
        logger.error("BPM detection failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={"error": f"Could not detect BPM from file: {e}", "code": "BPM_DETECTION_FAILED"},
        )

    if is_video:
        # Extract real keypoints from the uploaded video
        logger.info("Extracting pose keypoints from video...")
        suffix = os.path.splitext(file.filename or ".mp4")[1] or ".mp4"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            tmp.write(contents)
            tmp.flush()
            tmp.close()

            frames = extract_keypoints(tmp.name)
            fps = get_video_fps(tmp.name)
        finally:
            os.unlink(tmp.name)

        # Keep empty frames to preserve 1:1 mapping with video frames
        # (SkeletonCanvas skips drawing empty frames gracefully)
        non_empty = sum(1 for f in frames if f)
        logger.info("Extracted %d frames (%d with poses) at %.1f fps", len(frames), non_empty, fps)

        if non_empty == 0:
            raise HTTPException(
                status_code=400,
                detail={"error": "No pose detected in video", "code": "NO_POSE_DETECTED"},
            )

        # Check for duplicate videos in the database (>=98% similarity reuses existing move)
        DUPLICATE_THRESHOLD = 0.95
        SAMPLE_COUNT = 10
        sample_indices = [
            int(i * len(frames) / SAMPLE_COUNT) for i in range(SAMPLE_COUNT)
        ] if len(frames) >= SAMPLE_COUNT else list(range(len(frames)))
        sample_frames = [frames[i] for i in sample_indices]

        duplicate_move_id = None
        existing_moves = await moves_collection().find().to_list(length=None)
        for existing in existing_moves:
            ex_kps = existing.get("keypoints", [])
            if not ex_kps:
                continue

            ex_sample_indices = [
                int(i * len(ex_kps) / len(sample_indices))
                for i in range(len(sample_indices))
            ] if len(ex_kps) >= len(sample_indices) else list(range(len(ex_kps)))

            pairs = min(len(sample_frames), len(ex_sample_indices))
            if pairs == 0:
                continue

            total_sim = 0.0
            for j in range(pairs):
                a = normalize_keypoints(sample_frames[j])
                b = normalize_keypoints(ex_kps[ex_sample_indices[j]])
                total_sim += cosine_similarity(a, b)

            avg_sim = total_sim / pairs
            if avg_sim >= DUPLICATE_THRESHOLD:
                duplicate_move_id = existing["_id"]
                logger.info(
                    "Duplicate detected: %.2f similarity with move %s — reusing existing move",
                    avg_sim, duplicate_move_id,
                )
                break

        if duplicate_move_id:
            move_id = duplicate_move_id
        else:
            duration_ms = int((len(frames) / fps) * 1000)

            move_id = str(ObjectId())
            move_doc = {
                "_id": move_id,
                "keypoints": frames,
                "duration_ms": duration_ms,
                "bpm_range": [max(bpm - 10, 60), bpm + 10],
                "difficulty": difficulty,
                "genre_tags": ["uploaded"],
                "source_video_uri": file_uri,
            }
            await moves_collection().insert_one(move_doc)
            logger.info("Stored move %s from video (%d frames, %d ms)", move_id, len(frames), duration_ms)

        move_ids = [move_id]
    else:
        # Audio file: sample moves from existing pool
        move_ids = await assemble_sequence(
            bpm=bpm,
            difficulty=difficulty,
            seed=seed,
            moves_col=moves_collection(),
        )

        if not move_ids:
            logger.warning(
                "No matching moves for BPM=%d, difficulty=%s — seeding synthetic moves",
                bpm, difficulty,
            )
            await create_synthetic_moves(difficulty, moves_collection())
            move_ids = await assemble_sequence(
                bpm=bpm,
                difficulty=difficulty,
                seed=seed,
                moves_col=moves_collection(),
            )

    # Store choreography
    choreo_id = str(ObjectId())
    actual_seed = seed if seed is not None else hash(choreo_id) & 0xFFFFFFFF
    doc = {
        "_id": choreo_id,
        "song_uri": file_uri,
        "bpm": bpm,
        "difficulty": difficulty,
        "seed": actual_seed,
        "move_sequence": move_ids,
        "user_id": user_id,
    }
    await choreographies_collection().insert_one(doc)
    logger.info("Created choreography %s with %d moves", choreo_id, len(move_ids))

    return {
        "id": choreo_id,
        "bpm": bpm,
        "difficulty": difficulty,
        "seed": actual_seed,
        "move_count": len(move_ids),
    }


@router.post("/{choreo_id}/regenerate")
async def regenerate_choreography(choreo_id: str, seed: int | None = None):
    logger.info("Regenerate request: choreo_id=%s, seed=%s", choreo_id, seed)

    choreo = await choreographies_collection().find_one({"_id": choreo_id})
    if not choreo:
        logger.warning("Choreography not found: %s", choreo_id)
        raise HTTPException(
            status_code=404,
            detail={"error": "Choreography not found", "code": "JOB_NOT_FOUND"},
        )

    new_seed = seed if seed is not None else (choreo["seed"] + 1)
    move_ids = await assemble_sequence(
        bpm=choreo["bpm"],
        difficulty=choreo["difficulty"],
        seed=new_seed,
        moves_col=moves_collection(),
    )

    await choreographies_collection().update_one(
        {"_id": choreo_id},
        {"$set": {"move_sequence": move_ids, "seed": new_seed}},
    )
    logger.info("Regenerated choreography %s with seed %d", choreo_id, new_seed)

    return {
        "id": choreo_id,
        "seed": new_seed,
        "move_count": len(move_ids),
    }


@router.get("/{choreo_id}/preview")
async def get_preview(choreo_id: str):
    choreo = await choreographies_collection().find_one({"_id": choreo_id})
    if not choreo:
        logger.warning("Choreography not found for preview: %s", choreo_id)
        raise HTTPException(
            status_code=404,
            detail={"error": "Choreography not found", "code": "JOB_NOT_FOUND"},
        )

    # Fetch all moves in sequence
    moves = []
    for move_id in choreo["move_sequence"]:
        move = await moves_collection().find_one({"_id": move_id})
        if move:
            move_data = {
                "id": move["_id"],
                "keypoints": move["keypoints"],
                "duration_ms": move["duration_ms"],
            }
            # Include source video URI for proxy serving
            source_uri = move.get("source_video_uri")
            if source_uri:
                move_data["source_video_uri"] = source_uri
            moves.append(move_data)

    logger.info("Preview for %s: %d moves loaded", choreo_id, len(moves))

    return {
        "id": choreo_id,
        "bpm": choreo["bpm"],
        "difficulty": choreo["difficulty"],
        "song_uri": choreo["song_uri"],
        "moves": moves,
    }
