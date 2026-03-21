import logging

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import choreographies_collection, moves_collection
from app.services.audio import detect_bpm
from app.services.choreography import assemble_sequence
from app.services.storage import upload_bytes

logger = logging.getLogger("justdance.choreography")
router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"


@router.post("/generate")
async def generate_choreography(
    file: UploadFile, difficulty: str = "medium", seed: int | None = None
):
    user_id = DEV_USER_ID
    logger.info("Generate request: file=%s, difficulty=%s, seed=%s", file.filename, difficulty, seed)

    # Read and upload song
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

    try:
        song_uri = await upload_bytes(
            contents, file.filename or "song.mp3", file.content_type or "audio/mpeg"
        )
        logger.info("Uploaded to storage: %s", song_uri)
    except Exception as e:
        logger.error("Storage upload failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": f"Failed to upload file: {e}", "code": "STORAGE_ERROR"},
        )

    # Detect BPM from audio (works with both audio and video files)
    try:
        bpm = detect_bpm(contents, file.filename or "", file.content_type or "")
        logger.info("Detected BPM: %d", bpm)
    except Exception as e:
        logger.error("BPM detection failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={"error": f"Could not detect BPM from file: {e}", "code": "BPM_DETECTION_FAILED"},
        )

    # Sample moves from pool
    move_ids = await assemble_sequence(
        bpm=bpm,
        difficulty=difficulty,
        seed=seed,
        moves_col=moves_collection(),
    )

    if not move_ids:
        logger.warning("No matching moves for BPM=%d, difficulty=%s", bpm, difficulty)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "No moves in the pool match the detected BPM and difficulty",
                "code": "NO_MATCHING_MOVES",
            },
        )

    # Store choreography
    choreo_id = str(ObjectId())
    actual_seed = seed if seed is not None else hash(choreo_id) & 0xFFFFFFFF
    doc = {
        "_id": choreo_id,
        "song_uri": song_uri,
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
            moves.append(
                {
                    "id": move["_id"],
                    "keypoints": move["keypoints"],
                    "duration_ms": move["duration_ms"],
                }
            )

    logger.info("Preview for %s: %d moves loaded", choreo_id, len(moves))

    return {
        "id": choreo_id,
        "bpm": choreo["bpm"],
        "difficulty": choreo["difficulty"],
        "song_uri": choreo["song_uri"],
        "moves": moves,
    }
