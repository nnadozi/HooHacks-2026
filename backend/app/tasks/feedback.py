import logging
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

logger = logging.getLogger("justdance.tasks.feedback")

def _spread_sample(frames: list[dict], max_items: int) -> list[dict]:
    """Pick up to max_items frames spread across the full list (deterministic)."""
    if max_items <= 0 or not frames:
        return []
    if len(frames) <= max_items:
        return frames

    # Evenly spaced indices from [0, len-1]
    step = (len(frames) - 1) / (max_items - 1)
    indices = [int(round(i * step)) for i in range(max_items)]

    # De-dupe while preserving order, then top up if rounding collapsed indices.
    seen: set[int] = set()
    picked: list[dict] = []
    for idx in indices:
        if idx not in seen:
            seen.add(idx)
            picked.append(frames[idx])
    if len(picked) < max_items:
        for idx in range(len(frames)):
            if idx not in seen:
                picked.append(frames[idx])
                if len(picked) == max_items:
                    break

    return picked


@celery_app.task(name="tasks.analyze_performance")
def analyze_performance(job_id: str, file_uri: str, choreography_id: str) -> None:
    """Compare a performance video against a choreography and generate feedback."""
    jobs = sync_jobs_collection()
    choreos = sync_choreographies_collection()
    moves_col = sync_moves_collection()
    feedback_col = sync_feedback_collection()

    try:
        logger.info("Starting feedback analysis for job %s, choreo %s", job_id, choreography_id)
        jobs.update_one({"_id": job_id}, {"$set": {"status": "processing"}})

        # Load choreography
        choreo = choreos.find_one({"_id": choreography_id})
        if not choreo:
            logger.error("Choreography %s not found", choreography_id)
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "Choreography not found"}},
            )
            return

        # Build reference frames from move sequence
        reference_frames: list[list[dict]] = []
        ref_duration_ms = 0
        for move_id in choreo["move_sequence"]:
            move = moves_col.find_one({"_id": move_id})
            if move:
                reference_frames.extend(move["keypoints"])
                ref_duration_ms += move.get("duration_ms", 0)
        logger.info("Loaded %d reference frames from %d moves (total %d ms)", len(reference_frames), len(choreo["move_sequence"]), ref_duration_ms)

        if not reference_frames:
            logger.error("No reference frames found for choreo %s", choreography_id)
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "No reference frames found"}},
            )
            return

        # Download and process performance video
        video_path = download_to_temp(file_uri)
        logger.info("Downloaded performance video to %s", video_path)

        try:
            performance_frames = extract_keypoints(video_path)
            fps = get_video_fps(video_path)
            logger.info("Extracted %d performance frames at %.1f fps", len(performance_frames), fps)
        finally:
            os.unlink(video_path)

        if not performance_frames:
            logger.warning("No pose detected in performance video for job %s", job_id)
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "No pose detected in performance video"}},
            )
            return

        # Filter out empty frames and log detection rate
        non_empty = [f for f in performance_frames if f]
        logger.info(
            "Pose detection rate: %d/%d frames have keypoints (%.0f%%)",
            len(non_empty), len(performance_frames),
            100 * len(non_empty) / max(len(performance_frames), 1),
        )

        if not non_empty:
            logger.warning("All performance frames are empty (no poses detected) for job %s", job_id)
            jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "failed", "error": "No pose detected in performance video"}},
            )
            return

        # Compare frames (pass ref_duration_ms for time-aligned resampling)
        frame_results, breakdown, aggregate_score = compare_frames(
            reference_frames, performance_frames, fps,
            ref_duration_ms=ref_duration_ms if ref_duration_ms > 0 else None,
        )
        logger.info(
            "Scoring complete: score=%d, perfect=%d, good=%d, ok=%d, miss=%d",
            aggregate_score, breakdown["perfect"], breakdown["good"], breakdown["ok"], breakdown["miss"],
        )

        # Collect frames that need Gemini critique (OK and Miss only)
        frames_for_gemini = [
            f for f in frame_results if f["grade"] in ("ok", "miss")
        ]

        # Generate critiques via Gemini (limit to avoid excessive API calls)
        critiques = []
        if frames_for_gemini:
            sample = _spread_sample(frames_for_gemini, 20)
            logger.info("Sending %d frames to Gemini for critique", len(sample))
            try:
                critiques = generate_critiques(sample)
                logger.info("Received %d critiques from Gemini", len(critiques))
            except Exception as e:
                logger.error("Gemini critique generation failed: %s", e, exc_info=True)
                # Continue without critiques rather than failing the whole job

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
        logger.info("Stored feedback %s with score %d", feedback_id, aggregate_score)

        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "done", "result_id": feedback_id}},
        )
        logger.info("Feedback job %s completed successfully", job_id)

    except Exception as e:
        logger.error("Feedback job %s failed: %s", job_id, e, exc_info=True)
        jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "failed", "error": str(e)}},
        )
        raise
