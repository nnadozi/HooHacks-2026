import logging

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import choreographies_collection, jobs_collection
from app.services.storage import upload_bytes
from app.tasks.feedback import analyze_performance

logger = logging.getLogger("justdance.feedback")
router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"
ALLOWED_MIME_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


@router.post("/analyze")
async def analyze_feedback(file: UploadFile, choreography_id: str):
    user_id = DEV_USER_ID
    logger.info("Feedback analysis: choreo=%s, file=%s", choreography_id, file.filename)

    # Validate choreography exists
    choreo = await choreographies_collection().find_one({"_id": choreography_id})
    if not choreo:
        logger.warning("Choreography not found: %s", choreography_id)
        raise HTTPException(
            status_code=404,
            detail={"error": "Choreography not found", "code": "JOB_NOT_FOUND"},
        )

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        logger.warning("Rejected file type: %s", file.content_type)
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
        logger.warning("Upload too large: %d bytes", len(contents))
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                "code": "UPLOAD_TOO_LARGE",
            },
        )

    # Upload performance video
    try:
        file_uri = await upload_bytes(
            contents, file.filename or "performance.mp4", file.content_type or "video/mp4"
        )
        logger.info("Uploaded performance to storage: %s", file_uri)
    except Exception as e:
        logger.error("Storage upload failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": f"Failed to upload file: {e}", "code": "STORAGE_ERROR"},
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
    logger.info("Enqueued feedback task for job %s", job_id)

    return {"job_id": job_id}
