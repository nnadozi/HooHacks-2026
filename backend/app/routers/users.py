from fastapi import APIRouter

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
