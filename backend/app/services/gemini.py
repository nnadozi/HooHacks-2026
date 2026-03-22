import json
import re
from collections.abc import Iterable

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


def _normalize_xy(keypoints: list[dict], min_visibility: float = 0.5) -> list[dict] | None:
    """Normalize x/y keypoints to a unit bounding box.

    Normalization is computed from joints with visibility >= min_visibility.
    Returns a keypoint list (same length) with normalized x/y, or None if bounds
    cannot be computed (e.g., no sufficiently visible joints).
    """
    if not keypoints:
        return None

    xs: list[float] = []
    ys: list[float] = []
    for kp in keypoints:
        if kp.get("visibility", 0.0) >= min_visibility and "x" in kp and "y" in kp:
            xs.append(float(kp["x"]))
            ys.append(float(kp["y"]))

    if not xs or not ys:
        return None

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max(max_x - min_x, 1e-6)
    range_y = max(max_y - min_y, 1e-6)

    normalized: list[dict] = []
    for kp in keypoints:
        x = kp.get("x")
        y = kp.get("y")
        if x is None or y is None:
            normalized.append(kp)
            continue
        normalized.append(
            {
                **kp,
                "x": (float(x) - min_x) / range_x,
                "y": (float(y) - min_y) / range_y,
            }
        )
    return normalized


def build_joint_deltas(
    ref_keypoints: list[dict], perf_keypoints: list[dict]
) -> list[dict]:
    """Convert raw keypoints to human-readable joint deltas.

    Returns a list of {joint, expected: {x,y}, actual: {x,y}, delta: {dx,dy}} where
    x/y are first normalized to the dancer's unit bounding box (0-1 range).
    Only includes joints with visibility > 0.5 in both frames.
    """
    min_visibility = 0.5
    delta_threshold = 0.05
    max_joints = 6

    # Normalize each frame to a unit bounding box, matching the scoring contract.
    # If bounds can't be computed (e.g., low visibility), fall back to raw coords.
    ref_norm = _normalize_xy(ref_keypoints, min_visibility=min_visibility) or ref_keypoints
    perf_norm = _normalize_xy(perf_keypoints, min_visibility=min_visibility) or perf_keypoints

    candidates: list[dict] = []
    deltas = []
    for i, name in enumerate(JOINT_NAMES):
        if i >= len(ref_norm) or i >= len(perf_norm):
            break

        ref = ref_norm[i]
        perf = perf_norm[i]

        if ref.get("visibility", 0.0) < min_visibility or perf.get("visibility", 0.0) < min_visibility:
            continue

        if "x" not in ref or "y" not in ref or "x" not in perf or "y" not in perf:
            continue

        dx = float(perf["x"]) - float(ref["x"])
        dy = float(perf["y"]) - float(ref["y"])
        magnitude = abs(dx) + abs(dy)

        candidates.append(
            {
                "joint": name,
                "expected": {"x": round(float(ref["x"]), 3), "y": round(float(ref["y"]), 3)},
                "actual": {"x": round(float(perf["x"]), 3), "y": round(float(perf["y"]), 3)},
                "delta": {"dx": round(dx, 3), "dy": round(dy, 3)},
                "_magnitude": magnitude,
            }
        )

    # Prefer joints that exceed a significance threshold, but always keep a few
    # highest-delta joints so we don't end up with "no critiques" frames.
    primary = [
        c for c in candidates
        if abs(c["delta"]["dx"]) > delta_threshold or abs(c["delta"]["dy"]) > delta_threshold
    ]
    chosen = primary if primary else sorted(candidates, key=lambda c: c["_magnitude"], reverse=True)[:3]
    chosen = sorted(chosen, key=lambda c: c["_magnitude"], reverse=True)[:max_joints]

    for c in chosen:
        c.pop("_magnitude", None)
        deltas.append(c)

    return deltas


def _direction_hint(dx: float, dy: float) -> str:
    """Convert a delta into a human-readable direction."""
    parts = []
    if abs(dx) > 0.05:
        parts.append("to the left" if dx > 0 else "to the right")
    if abs(dy) > 0.05:
        parts.append("higher" if dy > 0 else "lower")
    return " and ".join(parts) if parts else "closer to the reference position"


def _build_delta_fallback(deltas: list[dict]) -> str:
    """Build a specific fallback critique from joint deltas when Gemini is unavailable."""
    if not deltas:
        return "Adjust your pose to better match the reference."

    top = deltas[0]
    joint = top["joint"].replace("_", " ")
    direction = _direction_hint(top["delta"]["dx"], top["delta"]["dy"])

    if len(deltas) >= 3:
        joints = [d["joint"].replace("_", " ") for d in deltas[:3]]
        return f"Multiple joints need adjustment — especially your {joints[0]}, {joints[1]}, and {joints[2]}. Move your {joint} {direction}."

    return f"Move your {joint} {direction}."


def _extract_response_text(response: object) -> str:
    """Best-effort extraction of plain text from google-genai responses."""
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    candidates = getattr(response, "candidates", None)
    if isinstance(candidates, Iterable):
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None)
            if not isinstance(parts, Iterable):
                continue
            chunks: list[str] = []
            for part in parts:
                t = getattr(part, "text", None)
                if isinstance(t, str) and t:
                    chunks.append(t)
            if chunks:
                joined = "".join(chunks).strip()
                if joined:
                    return joined

    return ""


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
    model = "gemini-2.0-flash"

    # Build prompt
    frame_descriptions = []
    ordered_timestamps: list[int] = []
    fallback_by_ts: dict[int, str] = {}
    for frame in frames_to_critique:
        ts = int(frame["timestamp_ms"])
        if ts not in ordered_timestamps:
            ordered_timestamps.append(ts)

        ref_kp = frame.get("ref_keypoints") or []
        perf_kp = frame.get("perf_keypoints") or []

        if not perf_kp:
            fallback_by_ts[ts] = "No pose detected — make sure your full body is visible and the lighting is good."
            continue

        deltas = build_joint_deltas(ref_kp, perf_kp)
        if not deltas:
            fallback_by_ts[ts] = "Try to match the reference pose more closely — focus on mirroring the arm positions and hip alignment."
            continue

        # Build a specific fallback from the top deltas in case Gemini is unavailable
        fallback_by_ts[ts] = _build_delta_fallback(deltas)

        ts_sec = ts / 1000
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
            f"timestamp_ms={frame['timestamp_ms']} ({ts_str}):\n" + "\n".join(delta_lines)
        )

    if not frame_descriptions:
        return [{"timestamp_ms": ts, "text": fallback_by_ts[ts]} for ts in ordered_timestamps if ts in fallback_by_ts]

    prompt = (
        "You are an expert dance choreography coach giving feedback to a student. "
        "For each timestamp below, the student's pose differs from the reference choreography. "
        "Joint positions are normalized to the dancer's bounding box (0-1 range). "
        "Positive x delta means the student is too far right; positive y delta means too far down.\n\n"
        "Guidelines for your critiques:\n"
        "- Be specific: name the body part AND the direction it needs to move (e.g., \"Raise your left arm higher\" not \"Fix your arm\").\n"
        "- Be varied: don't repeat the same phrasing across timestamps. Use different sentence structures.\n"
        "- Prioritize the BIGGEST deltas — those are the most impactful corrections.\n"
        "- When multiple joints are off in the same direction, describe the movement holistically "
        "(e.g., \"Shift your weight to the left — your whole upper body is leaning right\").\n"
        "- Include tips about body mechanics when relevant (e.g., \"Bend your knees more to lower your center of gravity\" "
        "or \"Rotate your torso to face the front\").\n"
        "- Mix correction types: positional fixes, rotation cues, weight distribution, extension/contraction, and timing.\n"
        "- Use encouraging, coaching language — direct but supportive.\n\n"
        "Return ONLY a JSON array — no markdown fences, no extra text. Each element must have:\n"
        "  \"timestamp_ms\": integer (copy exactly from the data below)\n"
        "  \"text\": 1-2 actionable sentences of coaching feedback\n\n"
        "Data:\n"
        + "\n\n".join(frame_descriptions)
    )

    try:
        from google import genai  # type: ignore

        if settings.VERTEX_PROJECT_ID:
            client = genai.Client(
                vertexai=True,
                project=settings.VERTEX_PROJECT_ID,
                location=settings.VERTEX_AI_LOCATION,
            )
        elif settings.GOOGLE_API_KEY:
            client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        else:
            raise RuntimeError("Missing GOOGLE_API_KEY (or VERTEX_PROJECT_ID) for Gemini critiques.")

        response = client.models.generate_content(model=model, contents=prompt)
        raw = _extract_response_text(response).strip()
    except Exception:
        # If Gemini is unavailable/misconfigured, return fallbacks rather than nothing.
        return [{"timestamp_ms": ts, "text": fallback_by_ts[ts]} for ts in ordered_timestamps if ts in fallback_by_ts]

    # Strip markdown code fences if the model wraps the JSON
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]
        critiques = [
            {"timestamp_ms": int(item["timestamp_ms"]), "text": str(item["text"])}
            for item in parsed
            if "timestamp_ms" in item and "text" in item
        ]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        critiques = []

    by_ts = {c["timestamp_ms"]: c["text"] for c in critiques}

    merged: list[dict] = []
    for ts in ordered_timestamps:
        text = by_ts.get(ts) or fallback_by_ts.get(ts)
        if text:
            merged.append({"timestamp_ms": ts, "text": text})

    return merged
