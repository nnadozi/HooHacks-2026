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
    similarity = max(0.0, 1.0 - (mean_dist / 0.85))
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


def _resample_frames(
    frames: list[list[dict]], source_count: int, target_count: int
) -> list[list[dict]]:
    """Resample frames to a target count using nearest-neighbour interpolation.

    Maps each target index to the closest source index so that frames align
    proportionally in time.
    """
    if target_count <= 0 or source_count <= 0 or not frames:
        return []
    resampled: list[list[dict]] = []
    for i in range(target_count):
        src_idx = int(i * source_count / target_count)
        src_idx = min(src_idx, len(frames) - 1)
        resampled.append(frames[src_idx])
    return resampled


def compare_frames(
    reference_frames: list[list[dict]],
    performance_frames: list[list[dict]],
    perf_fps: float,
    ref_duration_ms: int | None = None,
) -> tuple[list[dict], dict[str, int], int]:
    """Compare two sets of keypoint frames and return per-frame results.

    If ref_duration_ms is provided, performance frames are resampled to align
    with the reference timeline so that timestamps are accurate. Otherwise,
    falls back to frame-by-frame comparison.

    Returns:
        - frame_results: list of {timestamp_ms, similarity, grade, ref_kp, perf_kp}
        - grade_breakdown: {perfect: N, good: N, ok: N, miss: N}
        - aggregate_score: 0-100 integer
    """
    breakdown = {"perfect": 0, "good": 0, "ok": 0, "miss": 0}
    frame_results = []
    total_similarity = 0.0

    num_ref = len(reference_frames)
    num_perf = len(performance_frames)

    # Calculate reference FPS for accurate timestamps
    if ref_duration_ms and ref_duration_ms > 0 and num_ref > 0:
        ref_fps = num_ref / (ref_duration_ms / 1000.0)
    else:
        ref_fps = perf_fps

    # Calculate performance duration in ms
    perf_duration_ms = int((num_perf / perf_fps) * 1000) if perf_fps > 0 else 0
    ref_dur = ref_duration_ms if ref_duration_ms and ref_duration_ms > 0 else int((num_ref / ref_fps) * 1000)

    # Resample performance frames to match reference frame count
    # so that frame i of performance corresponds to the same moment in time
    # as frame i of reference
    if num_perf > 0 and num_ref > 0:
        # How many reference frames are covered by the performance duration
        covered_ref_frames = num_ref
        if ref_dur > 0 and perf_duration_ms < ref_dur:
            # Performance is shorter — only covers a portion of the reference
            covered_ref_frames = max(1, int(num_ref * perf_duration_ms / ref_dur))

        # Resample performance frames to align with the covered portion of reference
        aligned_perf = _resample_frames(performance_frames, num_perf, covered_ref_frames)
    else:
        aligned_perf = performance_frames
        covered_ref_frames = 0

    # Compare aligned frames
    overlap = min(num_ref, len(aligned_perf))
    for i in range(overlap):
        ref_norm = normalize_keypoints(reference_frames[i])
        perf_norm = normalize_keypoints(aligned_perf[i])

        sim = pose_similarity(ref_norm, perf_norm)
        grade = grade_frame(sim)
        breakdown[grade.value] += 1
        total_similarity += sim

        # Timestamp based on reference timeline
        timestamp_ms = int((i / ref_fps) * 1000)
        frame_results.append(
            {
                "timestamp_ms": timestamp_ms,
                "similarity": sim,
                "grade": grade.value,
                "ref_keypoints": reference_frames[i],
                "perf_keypoints": aligned_perf[i],
            }
        )

    # Count unmatched reference frames as misses (performance was too short)
    missed_frames = num_ref - overlap
    if missed_frames > 0:
        breakdown["miss"] += missed_frames
        for i in range(overlap, num_ref):
            timestamp_ms = int((i / ref_fps) * 1000)
            frame_results.append(
                {
                    "timestamp_ms": timestamp_ms,
                    "similarity": 0.0,
                    "grade": "miss",
                    "ref_keypoints": reference_frames[i],
                    "perf_keypoints": [],
                }
            )

    # Score based on total reference frames, not just overlapping ones
    aggregate = int((total_similarity / max(num_ref, 1)) * 100)
    return frame_results, breakdown, aggregate
