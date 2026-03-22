import logging
import os

from bson import ObjectId

from app.config import get_settings
from app.db import sync_jobs_collection, sync_moves_collection
from app.services.audio import detect_bpm
from app.services.cv import extract_keypoints, get_video_fps
from app.services.storage import download_to_temp
from app.worker import celery_app

logger = logging.getLogger("justdance.tasks.ingest")
settings = get_settings()


@celery_app.task(name="tasks.ingest_video")
def ingest_video(job_id: str, file_uri: str) -> None:
    """Download a reference video, extract pose keypoints, and store moves."""
    jobs = sync_jobs_collection()
    moves = sync_moves_collection()

    try:
        logger.info("Starting ingest for job %s from %s", job_id, file_uri)
        jobs.update_one({"_id": job_id}, {"$set": {"status": "processing"}})

        # Download video to temp file
        video_path = download_to_temp(file_uri)
        logger.info("Downloaded video to %s", video_path)

        try:
            # Extract keypoints
            all_frames = extract_keypoints(video_path, ffmpeg_path=settings.FFMPEG_PATH)
            fps = get_video_fps(video_path, ffmpeg_path=settings.FFMPEG_PATH)
            logger.info("Extracted %d frames at %.1f fps", len(all_frames), fps)

            if not all_frames:
                logger.warning("No pose detected in video for job %s", job_id)
                jobs.update_one(
                    {"_id": job_id},
                    {"$set": {"status": "failed", "error": "No pose detected in video"}},
                )
                return

            # Try to detect BPM from audio track
            try:
                with open(video_path, "rb") as f:
                    audio_data = f.read()
                bpm = detect_bpm(audio_data, file_uri, "")
                logger.info("Detected BPM: %d", bpm)
            except Exception as e:
                logger.warning("BPM detection failed, using default 120: %s", e)
                bpm = 120  # default fallback

            # Calculate duration
            duration_ms = int((len(all_frames) / fps) * 1000)

            # Store as a single move document
            move_id = str(ObjectId())
            move_doc = {
                "_id": move_id,
                "keypoints": all_frames,
                "duration_ms": duration_ms,
                "bpm_range": [max(bpm - 10, 60), bpm + 10],
                "difficulty": "medium",
                "genre_tags": [],
                "source_video_uri": file_uri,
            }
            moves.insert_one(move_doc)
            logger.info("Stored move %s (%d ms, BPM %d)", move_id, duration_ms, bpm)

            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "done", "result_id": move_id}},
            )
            logger.info("Ingest job %s completed successfully", job_id)

        finally:
            os.unlink(video_path)

    except Exception as e:
        logger.error("Ingest job %s failed: %s", job_id, e, exc_info=True)
        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "failed", "error": str(e)}},
        )
        raise
