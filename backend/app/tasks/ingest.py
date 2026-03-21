import os

from bson import ObjectId

from app.db import sync_jobs_collection, sync_moves_collection
from app.services.audio import detect_bpm
from app.services.cv import extract_keypoints, get_video_fps
from app.services.storage import download_to_temp
from app.worker import celery_app


@celery_app.task(name="tasks.ingest_video")
def ingest_video(job_id: str, file_uri: str) -> None:
    """Download a reference video, extract pose keypoints, and store moves."""
    jobs = sync_jobs_collection()
    moves = sync_moves_collection()

    try:
        jobs.update_one({"_id": job_id}, {"$set": {"status": "processing"}})

        # Download video to temp file
        video_path = download_to_temp(file_uri)

        try:
            # Extract keypoints
            all_frames = extract_keypoints(video_path)
            fps = get_video_fps(video_path)

            if not all_frames:
                jobs.update_one(
                    {"_id": job_id},
                    {"$set": {"status": "failed", "error": "No pose detected in video"}},
                )
                return

            # Try to detect BPM from audio track
            try:
                with open(video_path, "rb") as f:
                    audio_data = f.read()
                bpm = detect_bpm(audio_data)
            except Exception:
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

            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "done", "result_id": move_id}},
            )

        finally:
            os.unlink(video_path)

    except Exception as e:
        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "failed", "error": str(e)}},
        )
        raise
