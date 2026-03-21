import numpy as np

from app.config import get_settings
from app.models.feedback import GradeTier


def normalize_keypoints(keypoints: list[dict]) -> np.ndarray:
    """Normalize keypoints to a unit bounding box.

    Takes a list of {x, y, z, visibility} dicts and returns a flat numpy array
    of [x, y, z] values scaled to [0, 1] within the bounding box.
    """
    if not keypoints:
        return np.array([])

    pts = np.array([[kp["x"], kp["y"], kp["z"]] for kp in keypoints])
    mins = pts.min(axis=0)
    maxs = pts.max(axis=0)
    ranges = maxs - mins
    ranges[ranges == 0] = 1.0  # avoid division by zero

    normalized = (pts - mins) / ranges
    return normalized.flatten()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two flat keypoint vectors."""
    if a.size == 0 or b.size == 0:
        return 0.0

    # Ensure same length
    min_len = min(len(a), len(b))
    a = a[:min_len]
    b = b[:min_len]

    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot / (norm_a * norm_b))


def grade_frame(similarity: float) -> GradeTier:
    """Assign a grade tier to a frame based on cosine similarity."""
    thresholds = get_settings().score_thresholds_parsed

    if similarity >= thresholds["perfect"]:
        return GradeTier.PERFECT
    elif similarity >= thresholds["good"]:
        return GradeTier.GOOD
    elif similarity >= thresholds["ok"]:
        return GradeTier.OK
    else:
        return GradeTier.MISS


def compare_frames(
    reference_frames: list[list[dict]],
    performance_frames: list[list[dict]],
    fps: float,
) -> tuple[list[dict], dict[str, int], int]:
    """Compare two sets of keypoint frames and return per-frame results.

    Returns:
        - frame_results: list of {timestamp_ms, similarity, grade, ref_kp, perf_kp}
        - grade_breakdown: {perfect: N, good: N, ok: N, miss: N}
        - aggregate_score: 0-100 integer
    """
    breakdown = {"perfect": 0, "good": 0, "ok": 0, "miss": 0}
    frame_results = []
    total_similarity = 0.0

    # Align frame counts (use shorter sequence)
    num_frames = min(len(reference_frames), len(performance_frames))

    for i in range(num_frames):
        ref_norm = normalize_keypoints(reference_frames[i])
        perf_norm = normalize_keypoints(performance_frames[i])

        sim = cosine_similarity(ref_norm, perf_norm)
        grade = grade_frame(sim)
        breakdown[grade.value] += 1
        total_similarity += sim

        timestamp_ms = int((i / fps) * 1000)
        frame_results.append(
            {
                "timestamp_ms": timestamp_ms,
                "similarity": sim,
                "grade": grade.value,
                "ref_keypoints": reference_frames[i],
                "perf_keypoints": performance_frames[i],
            }
        )

    aggregate = int((total_similarity / max(num_frames, 1)) * 100)
    return frame_results, breakdown, aggregate
