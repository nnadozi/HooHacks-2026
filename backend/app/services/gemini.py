import json
import random
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


BODY_GROUP_MAP: dict[str, str] = {
    "nose": "head", "left_eye_inner": "head", "left_eye": "head", "left_eye_outer": "head",
    "right_eye_inner": "head", "right_eye": "head", "right_eye_outer": "head",
    "left_ear": "head", "right_ear": "head", "mouth_left": "head", "mouth_right": "head",
    "left_shoulder": "arms", "right_shoulder": "arms",
    "left_elbow": "arms", "right_elbow": "arms",
    "left_wrist": "hands", "right_wrist": "hands",
    "left_pinky": "hands", "right_pinky": "hands",
    "left_index": "hands", "right_index": "hands",
    "left_thumb": "hands", "right_thumb": "hands",
    "left_hip": "core", "right_hip": "core",
    "left_knee": "legs", "right_knee": "legs",
    "left_ankle": "legs", "right_ankle": "legs",
    "left_heel": "legs", "right_heel": "legs",
    "left_foot_index": "legs", "right_foot_index": "legs",
}

BODY_GROUP_TIPS: dict[str, list[str]] = {
    "head": ["Try nodding your head more to the beat", "Keep your head movements sharper and more expressive", "Add more head motion to match the energy"],
    "arms": ["Use bigger, more powerful arm movements", "Extend your arms fully — reach out with more energy", "Make your arm movements sharper and more defined"],
    "hands": ["Sharpen up your hand movements", "Add more flair to your hand gestures", "Keep your hand positions cleaner and more precise"],
    "core": ["Engage your core more — add some body rolls or hip movement", "Shift your weight more — use your hips to drive the motion", "Loosen up your torso and move with the rhythm"],
    "legs": ["Put more power into your legs", "Bend your knees more and commit to the movement", "Add more bounce and energy in your lower body"],
}


def _build_delta_fallback(deltas: list[dict]) -> str:
    """Build a high-level dance coaching fallback from joint deltas."""
    if not deltas:
        return "Try to feel the rhythm more and commit to each movement with full energy."

    # Find which body groups are most off
    group_scores: dict[str, float] = {}
    for d in deltas:
        group = BODY_GROUP_MAP.get(d["joint"], "core")
        mag = abs(d["delta"]["dx"]) + abs(d["delta"]["dy"])
        group_scores[group] = group_scores.get(group, 0.0) + mag

    top_groups = sorted(group_scores, key=group_scores.get, reverse=True)[:2]  # type: ignore[arg-type]

    tips = []
    for g in top_groups:
        group_tips = BODY_GROUP_TIPS.get(g, ["Match the reference pose more closely"])
        tips.append(random.choice(group_tips))

    return " ".join(tips)


def _merge_similar_critiques(critiques: list[dict], similarity_threshold: float = 0.5) -> list[dict]:
    """Merge consecutive critiques with similar text into time ranges."""
    if not critiques:
        return []

    def _words(text: str) -> set[str]:
        return set(text.lower().split())

    def _similar(a: str, b: str) -> bool:
        wa, wb = _words(a), _words(b)
        if not wa or not wb:
            return False
        overlap = len(wa & wb)
        return overlap / min(len(wa), len(wb)) >= similarity_threshold

    merged: list[dict] = []
    current = critiques[0].copy()
    current["_end_ms"] = current["timestamp_ms"]

    for c in critiques[1:]:
        if _similar(current["text"], c["text"]):
            current["_end_ms"] = c["timestamp_ms"]
        else:
            merged.append(current)
            current = c.copy()
            current["_end_ms"] = c["timestamp_ms"]
    merged.append(current)

    result: list[dict] = []
    for m in merged:
        result.append({"timestamp_ms": m["timestamp_ms"], "text": m["text"]})

    return result


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
        fallbacks = [{"timestamp_ms": ts, "text": fallback_by_ts[ts]} for ts in ordered_timestamps if ts in fallback_by_ts]
        return _merge_similar_critiques(fallbacks)

    prompt = (
        "You are a fun, encouraging dance coach giving high-level feedback to a student. "
        "For each timestamp below, the student's pose differs from the reference choreography. "
        "Joint positions are normalized to the dancer's bounding box (0-1 range).\n\n"
        "IMPORTANT guidelines:\n"
        "- Give HIGH-LEVEL dance coaching — talk about body groups (arms, legs, head, core, hands), "
        "NOT specific joints like 'left_index' or 'right_wrist'.\n"
        "- Use dance-style language: 'sharper hand movements', 'more power in your legs', "
        "'nod your head to the beat', 'extend your arms fully', 'loosen up your hips'.\n"
        "- If multiple timestamps have similar issues, combine them into ONE critique using the EARLIEST timestamp. "
        "Do NOT include time ranges in the text itself.\n"
        "- Be encouraging and energetic — like a real dance instructor.\n"
        "- Focus on energy, sharpness, extension, rhythm, and commitment to the movement.\n"
        "- Keep it to 1 sentence per critique, max 8 critiques total.\n"
        "- Do NOT mention coordinate numbers, deltas, or technical joint names.\n\n"
        "Return ONLY a JSON array — no markdown fences, no extra text. Each element must have:\n"
        "  \"timestamp_ms\": integer (use the START of a time range if combining)\n"
        "  \"text\": 1 sentence of fun, high-level dance coaching\n\n"
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
        fallbacks = [{"timestamp_ms": ts, "text": fallback_by_ts[ts]} for ts in ordered_timestamps if ts in fallback_by_ts]
        return _merge_similar_critiques(fallbacks)

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

    combined: list[dict] = []
    for ts in ordered_timestamps:
        text = by_ts.get(ts) or fallback_by_ts.get(ts)
        if text:
            combined.append({"timestamp_ms": ts, "text": text})

    return _merge_similar_critiques(combined)
