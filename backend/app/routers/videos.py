from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import get_settings
from app.db import jobs_collection
from app.tasks.ingest import ingest_video

router = APIRouter()
settings = get_settings()

DEV_USER_ID = "dev-user"
ALLOWED_MIME_TYPES = {"video/mp4", "video/quicktime", "video/webm"}


@router.post("/upload")
async def upload_video(file: UploadFile):
    user_id = DEV_USER_ID

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
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
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                "code": "UPLOAD_TOO_LARGE",
            },
        )

    # Upload to cloud storage
    from app.services.storage import upload_bytes

    file_uri = await upload_bytes(
        contents, file.filename or "upload.mp4", file.content_type or "video/mp4"
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

    return {"job_id": job_id}
