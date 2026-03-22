from fastapi import APIRouter, HTTPException

from app.db import feedback_collection

router = APIRouter()

DEV_USER_ID = "dev-user"


@router.get("/history")
async def get_history():
    cursor = feedback_collection().find(
        {"user_id": DEV_USER_ID}
    ).sort("created_at", -1).limit(50)

    results = []
    async for doc in cursor:
        results.append(
            {
                "id": doc["_id"],
                "choreography_id": doc["choreography_id"],
                "score": doc["score"],
                "grade_breakdown": doc["grade_breakdown"],
                "critiques": doc["critiques"],
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
