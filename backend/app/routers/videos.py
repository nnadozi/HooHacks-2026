import logging

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import jobs_collection
from app.tasks.ingest import ingest_video

logger = logging.getLogger("justdance.videos")
router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"
ALLOWED_MIME_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


@router.post("/upload")
async def upload_video(file: UploadFile):
    user_id = DEV_USER_ID
    logger.info("Video upload: file=%s, type=%s", file.filename, file.content_type)

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

    # Read and validate file size
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

    # Upload to cloud storage
    from app.services.storage import upload_bytes

    try:
        file_uri = await upload_bytes(
            contents, file.filename or "upload.mp4", file.content_type or "video/mp4"
        )
        logger.info("Uploaded to storage: %s", file_uri)
    except Exception as e:
        logger.error("Storage upload failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": f"Failed to upload file: {e}", "code": "STORAGE_ERROR"},
        )

    # Create job document
    job_id = str(ObjectId())
    await jobs_collection().insert_one(
        {
            "_id": job_id,
            "user_id": user_id,
            "status": "pending",
            "type": "ingest",
            "file_uri": file_uri,
            "result_id": None,
        }
    )

    # Enqueue Celery task
    ingest_video.delay(job_id, file_uri)
    logger.info("Enqueued ingest task for job %s", job_id)

    return {"job_id": job_id}
