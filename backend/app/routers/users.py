from fastapi import APIRouter, HTTPException

from app.db import choreographies_collection, feedback_collection, moves_collection

router = APIRouter()

DEV_USER_ID = "dev-user"


@router.get("/history")
async def get_history():
    cursor = choreographies_collection().find(
        {"user_id": DEV_USER_ID}
    ).sort("created_at", -1).limit(50)

    results = []
    async for doc in cursor:
        # Only return sessions that still have at least one move present.
        move_sequence = doc.get("move_sequence") or []
        if not move_sequence:
            continue
        any_move = await moves_collection().find_one(
            {"_id": {"$in": move_sequence}},
            projection={"_id": 1},
        )
        if not any_move:
            continue

        feedback = None
        latest_feedback_id = doc.get("latest_feedback_id")
        if latest_feedback_id:
            feedback = await feedback_collection().find_one({"_id": latest_feedback_id})
        if not feedback:
            latest_list = await feedback_collection().find(
                {"user_id": DEV_USER_ID, "choreography_id": doc["_id"]}
            ).sort("created_at", -1).limit(1).to_list(length=1)
            feedback = latest_list[0] if latest_list else None

        results.append(
            {
                "id": doc["_id"],
                "choreography_id": doc["_id"],
                "bpm": doc.get("bpm"),
                "difficulty": doc.get("difficulty"),
                "song_uri": doc.get("song_uri"),
                "performance_uri": doc.get("performance_uri"),
                "feedback_id": (feedback or {}).get("_id"),
                "score": (feedback or {}).get("score"),
                "grade_breakdown": (feedback or {}).get("grade_breakdown"),
                "critiques": (feedback or {}).get("critiques"),
                "created_at": doc.get("created_at"),
            }
        )

    return {"history": results}


@router.get("/feedback/{feedback_id}")
async def get_feedback(feedback_id: str):
    doc = await feedback_collection().find_one({"_id": feedback_id})
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"error": "Feedback not found", "code": "JOB_NOT_FOUND"},
        )

    return {
        "id": doc["_id"],
        "choreography_id": doc["choreography_id"],
        "score": doc["score"],
        "grade_breakdown": doc["grade_breakdown"],
        "critiques": doc["critiques"],
        "created_at": doc.get("created_at"),
    }
