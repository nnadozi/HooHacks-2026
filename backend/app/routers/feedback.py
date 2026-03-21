from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import choreographies_collection, jobs_collection
from app.services.storage import upload_bytes
from app.tasks.feedback import analyze_performance

router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"
ALLOWED_MIME_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


@router.post("/analyze")
async def analyze_feedback(file: UploadFile, choreography_id: str):
    user_id = DEV_USER_ID

    # Validate choreography exists
    choreo = await choreographies_collection().find_one({"_id": choreography_id})
    if not choreo:
        raise HTTPException(
            status_code=404,
            detail={"error": "Choreography not found", "code": "JOB_NOT_FOUND"},
        )

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Invalid file type: {file.content_type}. Accepted: MP4, MOV, WebM",
                "code": "INVALID_FORMAT",
            },
        )

    # Read and validate size
    contents = await file.read()
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                "code": "UPLOAD_TOO_LARGE",
            },
        )

    # Upload performance video
    file_uri = await upload_bytes(
        contents, file.filename or "performance.mp4", file.content_type or "video/mp4"
    )

    # Create job
    job_id = str(ObjectId())
    await jobs_collection().insert_one(
        {
            "_id": job_id,
            "user_id": user_id,
            "status": "pending",
            "type": "feedback",
            "file_uri": file_uri,
            "choreography_id": choreography_id,
            "result_id": None,
        }
    )

    # Enqueue
    analyze_performance.delay(job_id, file_uri, choreography_id)

    return {"job_id": job_id}
