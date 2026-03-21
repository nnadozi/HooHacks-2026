import google.generativeai as genai

from app.config import get_settings

# MediaPipe pose landmark names (33 landmarks)
JOINT_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]


def build_joint_deltas(
    ref_keypoints: list[dict], perf_keypoints: list[dict]
) -> list[dict]:
    """Convert raw keypoints to human-readable joint deltas.

    Returns a list of {joint, expected: {x,y}, actual: {x,y}, delta: {dx,dy}}.
    Only includes joints with visibility > 0.5 in both frames.
    """
    deltas = []
    for i, name in enumerate(JOINT_NAMES):
        if i >= len(ref_keypoints) or i >= len(perf_keypoints):
            break

        ref = ref_keypoints[i]
        perf = perf_keypoints[i]

        if ref.get("visibility", 0) < 0.5 or perf.get("visibility", 0) < 0.5:
            continue

        dx = perf["x"] - ref["x"]
        dy = perf["y"] - ref["y"]

        # Only include joints with significant delta
        if abs(dx) > 0.05 or abs(dy) > 0.05:
            deltas.append(
                {
                    "joint": name,
                    "expected": {"x": round(ref["x"], 3), "y": round(ref["y"], 3)},
                    "actual": {"x": round(perf["x"], 3), "y": round(perf["y"], 3)},
                    "delta": {"dx": round(dx, 3), "dy": round(dy, 3)},
                }
            )

    return deltas


def generate_critiques(
    frames_to_critique: list[dict],
) -> list[dict]:
    """Send batched frame deltas to Gemini and return timestamped critiques.

    Each entry in frames_to_critique should have:
        - timestamp_ms: int
        - ref_keypoints: list[dict]
        - perf_keypoints: list[dict]

    Returns a list of {timestamp_ms: int, text: str}.
    """
    settings = get_settings()
    genai.configure(api_key=settings.GOOGLE_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")

    # Build prompt
    frame_descriptions = []
    for frame in frames_to_critique:
        deltas = build_joint_deltas(frame["ref_keypoints"], frame["perf_keypoints"])
        if not deltas:
            continue

        ts_sec = frame["timestamp_ms"] / 1000
        minutes = int(ts_sec // 60)
        seconds = ts_sec % 60
        ts_str = f"{minutes}:{seconds:04.1f}"

        delta_lines = []
        for d in deltas:
            delta_lines.append(
                f"  - {d['joint']}: expected ({d['expected']['x']}, {d['expected']['y']}), "
                f"actual ({d['actual']['x']}, {d['actual']['y']}), "
                f"delta ({d['delta']['dx']}, {d['delta']['dy']})"
            )

        frame_descriptions.append(
            f"Timestamp {ts_str}:\n" + "\n".join(delta_lines)
        )

    if not frame_descriptions:
        return []

    prompt = (
        "You are a dance coach analyzing a student's performance. "
        "For each timestamp below, the student's pose differs from the reference. "
        "Joint positions are normalized (0-1 range). "
        "Positive x delta means too far right, positive y delta means too far down.\n\n"
        "For each timestamp, return exactly one concise critique sentence explaining "
        "what the student should fix. Format each line as:\n"
        "TIMESTAMP — critique\n\n"
        + "\n\n".join(frame_descriptions)
    )

    response = model.generate_content(prompt)
    text = response.text.strip()

    # Parse response lines
    critiques = []
    for frame in frames_to_critique:
        ts_sec = frame["timestamp_ms"] / 1000
        minutes = int(ts_sec // 60)
        seconds = ts_sec % 60
        ts_str = f"{minutes}:{seconds:04.1f}"

        for line in text.split("\n"):
            if ts_str in line and "—" in line:
                critique_text = line.split("—", 1)[1].strip()
                critiques.append(
                    {
                        "timestamp_ms": frame["timestamp_ms"],
                        "text": critique_text,
                    }
                )
                break
        else:
            # If Gemini didn't produce a matching line, still include a generic one
            critiques.append(
                {
                    "timestamp_ms": frame["timestamp_ms"],
                    "text": "Pose needs improvement at this timestamp.",
                }
            )

    return critiques
