from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import choreographies_collection, moves_collection
from app.services.audio import detect_bpm
from app.services.choreography import assemble_sequence
from app.services.storage import upload_bytes

router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"


@router.post("/generate")
async def generate_choreography(
    file: UploadFile, difficulty: str = "medium", seed: int | None = None
):
    user_id = DEV_USER_ID

    # Read and upload song
    contents = await file.read()
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                "code": "UPLOAD_TOO_LARGE",
            },
        )

    song_uri = await upload_bytes(
        contents, file.filename or "song.mp3", file.content_type or "audio/mpeg"
    )

    # Detect BPM from audio (works with both audio and video files)
    bpm = detect_bpm(contents, file.filename or "", file.content_type or "")

    # Sample moves from pool
    move_ids = await assemble_sequence(
        bpm=bpm,
        difficulty=difficulty,
        seed=seed,
        moves_col=moves_collection(),
    )

    if not move_ids:
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

    return {
        "id": choreo_id,
        "bpm": bpm,
        "difficulty": difficulty,
        "seed": actual_seed,
        "move_count": len(move_ids),
    }


@router.post("/{choreo_id}/regenerate")
async def regenerate_choreography(choreo_id: str, seed: int | None = None):
    choreo = await choreographies_collection().find_one({"_id": choreo_id})
    if not choreo:
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

    return {
        "id": choreo_id,
        "seed": new_seed,
        "move_count": len(move_ids),
    }


@router.get("/{choreo_id}/preview")
async def get_preview(choreo_id: str):
    choreo = await choreographies_collection().find_one({"_id": choreo_id})
    if not choreo:
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

    return {
        "id": choreo_id,
        "bpm": choreo["bpm"],
        "difficulty": choreo["difficulty"],
        "song_uri": choreo["song_uri"],
        "moves": moves,
    }
