import os

from bson import ObjectId

from app.db import (
    sync_choreographies_collection,
    sync_feedback_collection,
    sync_jobs_collection,
    sync_moves_collection,
)
from app.services.cv import extract_keypoints, get_video_fps
from app.services.gemini import generate_critiques
from app.services.scoring import compare_frames
from app.services.storage import download_to_temp
from app.worker import celery_app


@celery_app.task(name="tasks.analyze_performance")
def analyze_performance(job_id: str, file_uri: str, choreography_id: str) -> None:
    """Compare a performance video against a choreography and generate feedback."""
    jobs = sync_jobs_collection()
    choreos = sync_choreographies_collection()
    moves_col = sync_moves_collection()
    feedback_col = sync_feedback_collection()

    try:
        jobs.update_one({"_id": job_id}, {"$set": {"status": "processing"}})

        # Load choreography
        choreo = choreos.find_one({"_id": choreography_id})
        if not choreo:
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "Choreography not found"}},
            )
            return

        # Build reference frames from move sequence
        reference_frames: list[list[dict]] = []
        for move_id in choreo["move_sequence"]:
            move = moves_col.find_one({"_id": move_id})
            if move:
                reference_frames.extend(move["keypoints"])

        if not reference_frames:
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "No reference frames found"}},
            )
            return

        # Download and process performance video
        video_path = download_to_temp(file_uri)

        try:
            performance_frames = extract_keypoints(video_path)
            fps = get_video_fps(video_path)
        finally:
            os.unlink(video_path)

        if not performance_frames:
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "No pose detected in performance video"}},
            )
            return

        # Compare frames
        frame_results, breakdown, aggregate_score = compare_frames(
            reference_frames, performance_frames, fps
        )

        # Collect frames that need Gemini critique (OK and Miss only)
        frames_for_gemini = [
            f for f in frame_results if f["grade"] in ("ok", "miss")
        ]

        # Generate critiques via Gemini (limit to avoid excessive API calls)
        critiques = []
        if frames_for_gemini:
            # Sample up to 20 frames to keep Gemini cost manageable
            sample = frames_for_gemini[:20]
            critiques = generate_critiques(sample)

        # Store feedback document
        job = jobs.find_one({"_id": job_id})
        feedback_id = str(ObjectId())
        feedback_doc = {
            "_id": feedback_id,
            "choreography_id": choreography_id,
            "user_id": job["user_id"],
            "score": aggregate_score,
            "grade_breakdown": breakdown,
            "critiques": critiques,
        }
        feedback_col.insert_one(feedback_doc)

        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "done", "result_id": feedback_id}},
        )

    except Exception as e:
        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "failed", "error": str(e)}},
        )
        raise
