import logging
import os

from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import get_settings
from app.db import jobs_collection
from app.services.storage import download_to_temp
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

    # Ensure filename has proper extension for codec detection
    filename = file.filename or "upload"
    mime_to_ext = {"video/webm": ".webm", "video/mp4": ".mp4", "video/quicktime": ".mov"}
    ext = mime_to_ext.get(file.content_type or "", ".mp4")
    if not any(filename.endswith(e) for e in mime_to_ext.values()):
        filename = filename + ext

    # Upload to cloud storage
    try:
        file_uri = await upload_bytes(
            contents, filename, file.content_type or "video/mp4"
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


@router.get("/serve")
async def serve_video(uri: str):
    """Proxy a GCS video to the browser. Accepts a gs:// URI as query param."""
    if not uri.startswith("gs://"):
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid URI format", "code": "INVALID_FORMAT"},
        )

    try:
        local_path = download_to_temp(uri)
    except Exception as e:
        logger.error("Failed to download video %s: %s", uri, e)
        raise HTTPException(
            status_code=404,
            detail={"error": "Video not found", "code": "JOB_NOT_FOUND"},
        )

    # Determine media type from extension
    ext = os.path.splitext(local_path)[1].lower()
    media_types = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}
    media_type = media_types.get(ext, "video/mp4")

    return FileResponse(local_path, media_type=media_type)
