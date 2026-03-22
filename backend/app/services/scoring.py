import numpy as np

from app.config import get_settings
from app.models.feedback import GradeTier


def normalize_keypoints(keypoints: list[dict]) -> np.ndarray:
    """Normalize keypoints to a uniform scale and centered position.

    Takes a list of {x, y, z, visibility} dicts and returns a flat numpy array
    of [x, y, z] values centered around the origin and scaled uniformly
    to avoid distorting the human pose aspect ratio.
    """
    if not keypoints:
        return np.array([])

    pts = np.array([[kp["x"], kp["y"], kp["z"]] for kp in keypoints])
    mins = pts.min(axis=0)
    maxs = pts.max(axis=0)

    # Center the pose at the origin
    center = (maxs + mins) / 2.0
    centered = pts - center

    # Scale uniformly based on the maximum range to preserve proportions
    ranges = maxs - mins
    max_range = np.max(ranges)
    if max_range == 0:
        max_range = 1.0

    normalized = centered / max_range
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


def pose_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute pose similarity using mean per-joint Euclidean distance.

    Cosine similarity is too forgiving for normalized pose vectors because
    all human poses have similar structure. Instead, we measure the average
    per-joint distance and convert it to a 0-1 similarity score.

    A perfect match gives 1.0. Larger distances reduce the score toward 0.
    """
    if a.size == 0 or b.size == 0:
        return 0.0

    # Ensure same length
    min_len = min(len(a), len(b))
    a = a[:min_len]
    b = b[:min_len]

    # Reshape to (N, 3) for per-joint distance
    num_joints = min_len // 3
    if num_joints == 0:
        return 0.0

    a_joints = a[: num_joints * 3].reshape(num_joints, 3)
    b_joints = b[: num_joints * 3].reshape(num_joints, 3)

    # Mean per-joint Euclidean distance (in normalized [0,1] space)
    distances = np.linalg.norm(a_joints - b_joints, axis=1)
    mean_dist = float(np.mean(distances))

    # Convert distance to similarity: 0 distance -> 1.0, large distance -> 0.0
    # With uniform scaling, distances are more spread out so use a wider divisor
    similarity = max(0.0, 1.0 - (mean_dist / 0.60))
    return similarity


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

        sim = pose_similarity(ref_norm, perf_norm)
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
