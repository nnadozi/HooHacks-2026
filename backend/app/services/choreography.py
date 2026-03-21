import copy
import random

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

# ---------------------------------------------------------------------------
# Synthetic move generation — used when the moves pool is empty
# ---------------------------------------------------------------------------

# 33-keypoint neutral standing pose (normalized 0-1, MediaPipe Pose format)
_NEUTRAL_POSE: list[dict] = [
    {"x": 0.50, "y": 0.12, "z": 0.0, "visibility": 0.99},  # 0  nose
    {"x": 0.48, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 1  left_eye_inner
    {"x": 0.46, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 2  left_eye
    {"x": 0.44, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 3  left_eye_outer
    {"x": 0.52, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 4  right_eye_inner
    {"x": 0.54, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 5  right_eye
    {"x": 0.56, "y": 0.10, "z": 0.0, "visibility": 0.99},  # 6  right_eye_outer
    {"x": 0.43, "y": 0.13, "z": 0.0, "visibility": 0.99},  # 7  left_ear
    {"x": 0.57, "y": 0.13, "z": 0.0, "visibility": 0.99},  # 8  right_ear
    {"x": 0.49, "y": 0.14, "z": 0.0, "visibility": 0.99},  # 9  mouth_left
    {"x": 0.51, "y": 0.14, "z": 0.0, "visibility": 0.99},  # 10 mouth_right
    {"x": 0.40, "y": 0.32, "z": 0.0, "visibility": 0.99},  # 11 left_shoulder
    {"x": 0.60, "y": 0.32, "z": 0.0, "visibility": 0.99},  # 12 right_shoulder
    {"x": 0.36, "y": 0.48, "z": 0.0, "visibility": 0.99},  # 13 left_elbow
    {"x": 0.64, "y": 0.48, "z": 0.0, "visibility": 0.99},  # 14 right_elbow
    {"x": 0.34, "y": 0.64, "z": 0.0, "visibility": 0.99},  # 15 left_wrist
    {"x": 0.66, "y": 0.64, "z": 0.0, "visibility": 0.99},  # 16 right_wrist
    {"x": 0.33, "y": 0.67, "z": 0.0, "visibility": 0.99},  # 17 left_pinky
    {"x": 0.67, "y": 0.67, "z": 0.0, "visibility": 0.99},  # 18 right_pinky
    {"x": 0.33, "y": 0.67, "z": 0.0, "visibility": 0.99},  # 19 left_index
    {"x": 0.67, "y": 0.67, "z": 0.0, "visibility": 0.99},  # 20 right_index
    {"x": 0.34, "y": 0.66, "z": 0.0, "visibility": 0.99},  # 21 left_thumb
    {"x": 0.66, "y": 0.66, "z": 0.0, "visibility": 0.99},  # 22 right_thumb
    {"x": 0.44, "y": 0.62, "z": 0.0, "visibility": 0.99},  # 23 left_hip
    {"x": 0.56, "y": 0.62, "z": 0.0, "visibility": 0.99},  # 24 right_hip
    {"x": 0.44, "y": 0.78, "z": 0.0, "visibility": 0.99},  # 25 left_knee
    {"x": 0.56, "y": 0.78, "z": 0.0, "visibility": 0.99},  # 26 right_knee
    {"x": 0.44, "y": 0.93, "z": 0.0, "visibility": 0.99},  # 27 left_ankle
    {"x": 0.56, "y": 0.93, "z": 0.0, "visibility": 0.99},  # 28 right_ankle
    {"x": 0.43, "y": 0.95, "z": 0.0, "visibility": 0.99},  # 29 left_heel
    {"x": 0.57, "y": 0.95, "z": 0.0, "visibility": 0.99},  # 30 right_heel
    {"x": 0.44, "y": 0.97, "z": 0.0, "visibility": 0.99},  # 31 left_foot_index
    {"x": 0.56, "y": 0.97, "z": 0.0, "visibility": 0.99},  # 32 right_foot_index
]

# Per-pose overrides from neutral (joint index → coordinate changes)
_POSE_OVERRIDES: list[dict[int, dict]] = [
    # 0: Arms Up
    {
        13: {"x": 0.38, "y": 0.20}, 14: {"x": 0.62, "y": 0.20},
        15: {"x": 0.36, "y": 0.06}, 16: {"x": 0.64, "y": 0.06},
        17: {"x": 0.35, "y": 0.04}, 18: {"x": 0.65, "y": 0.04},
        19: {"x": 0.35, "y": 0.04}, 20: {"x": 0.65, "y": 0.04},
        21: {"x": 0.36, "y": 0.05}, 22: {"x": 0.64, "y": 0.05},
    },
    # 1: Arms Wide
    {
        13: {"x": 0.22, "y": 0.32}, 14: {"x": 0.78, "y": 0.32},
        15: {"x": 0.10, "y": 0.32}, 16: {"x": 0.90, "y": 0.32},
        17: {"x": 0.09, "y": 0.33}, 18: {"x": 0.91, "y": 0.33},
        19: {"x": 0.09, "y": 0.32}, 20: {"x": 0.91, "y": 0.32},
        21: {"x": 0.10, "y": 0.31}, 22: {"x": 0.90, "y": 0.31},
    },
    # 2: Left Arm Up, Right Arm Down
    {
        13: {"x": 0.38, "y": 0.20}, 15: {"x": 0.36, "y": 0.06},
        17: {"x": 0.35, "y": 0.04}, 19: {"x": 0.35, "y": 0.04}, 21: {"x": 0.36, "y": 0.05},
        14: {"x": 0.66, "y": 0.55}, 16: {"x": 0.68, "y": 0.72},
        18: {"x": 0.69, "y": 0.74}, 20: {"x": 0.69, "y": 0.74}, 22: {"x": 0.68, "y": 0.73},
    },
    # 3: Right Arm Up, Left Arm Down
    {
        14: {"x": 0.62, "y": 0.20}, 16: {"x": 0.64, "y": 0.06},
        18: {"x": 0.65, "y": 0.04}, 20: {"x": 0.65, "y": 0.04}, 22: {"x": 0.64, "y": 0.05},
        13: {"x": 0.34, "y": 0.55}, 15: {"x": 0.32, "y": 0.72},
        17: {"x": 0.31, "y": 0.74}, 19: {"x": 0.31, "y": 0.74}, 21: {"x": 0.32, "y": 0.73},
    },
    # 4: Crouch
    {
        0: {"x": 0.50, "y": 0.22},
        1: {"x": 0.48, "y": 0.20}, 2: {"x": 0.46, "y": 0.20}, 3: {"x": 0.44, "y": 0.20},
        4: {"x": 0.52, "y": 0.20}, 5: {"x": 0.54, "y": 0.20}, 6: {"x": 0.56, "y": 0.20},
        7: {"x": 0.43, "y": 0.23}, 8: {"x": 0.57, "y": 0.23},
        9: {"x": 0.49, "y": 0.24}, 10: {"x": 0.51, "y": 0.24},
        11: {"x": 0.40, "y": 0.42}, 12: {"x": 0.60, "y": 0.42},
        13: {"x": 0.36, "y": 0.55}, 14: {"x": 0.64, "y": 0.55},
        15: {"x": 0.34, "y": 0.68}, 16: {"x": 0.66, "y": 0.68},
        17: {"x": 0.33, "y": 0.71}, 18: {"x": 0.67, "y": 0.71},
        19: {"x": 0.33, "y": 0.71}, 20: {"x": 0.67, "y": 0.71},
        21: {"x": 0.34, "y": 0.70}, 22: {"x": 0.66, "y": 0.70},
        23: {"x": 0.44, "y": 0.68}, 24: {"x": 0.56, "y": 0.68},
        25: {"x": 0.40, "y": 0.80}, 26: {"x": 0.60, "y": 0.80},
        27: {"x": 0.40, "y": 0.93}, 28: {"x": 0.60, "y": 0.93},
        29: {"x": 0.39, "y": 0.95}, 30: {"x": 0.61, "y": 0.95},
        31: {"x": 0.40, "y": 0.97}, 32: {"x": 0.60, "y": 0.97},
    },
    # 5: Side Step Left
    {
        0: {"x": 0.44, "y": 0.12},
        1: {"x": 0.42, "y": 0.10}, 2: {"x": 0.40, "y": 0.10}, 3: {"x": 0.38, "y": 0.10},
        4: {"x": 0.46, "y": 0.10}, 5: {"x": 0.48, "y": 0.10}, 6: {"x": 0.50, "y": 0.10},
        7: {"x": 0.37, "y": 0.13}, 8: {"x": 0.51, "y": 0.13},
        9: {"x": 0.43, "y": 0.14}, 10: {"x": 0.45, "y": 0.14},
        11: {"x": 0.34, "y": 0.32}, 12: {"x": 0.54, "y": 0.32},
        13: {"x": 0.28, "y": 0.46}, 14: {"x": 0.60, "y": 0.46},
        15: {"x": 0.24, "y": 0.60}, 16: {"x": 0.62, "y": 0.62},
        17: {"x": 0.23, "y": 0.63}, 18: {"x": 0.63, "y": 0.64},
        19: {"x": 0.23, "y": 0.63}, 20: {"x": 0.63, "y": 0.64},
        21: {"x": 0.24, "y": 0.62}, 22: {"x": 0.62, "y": 0.63},
        23: {"x": 0.38, "y": 0.62}, 24: {"x": 0.50, "y": 0.62},
        25: {"x": 0.34, "y": 0.78}, 26: {"x": 0.52, "y": 0.78},
        27: {"x": 0.30, "y": 0.93}, 28: {"x": 0.54, "y": 0.93},
        29: {"x": 0.29, "y": 0.95}, 30: {"x": 0.53, "y": 0.95},
        31: {"x": 0.30, "y": 0.97}, 32: {"x": 0.54, "y": 0.97},
    },
]


def _build_pose(overrides: dict[int, dict]) -> list[dict]:
    pose = copy.deepcopy(_NEUTRAL_POSE)
    for idx, changes in overrides.items():
        pose[idx].update(changes)
    return pose


def _interpolate_poses(
    pose_a: list[dict], pose_b: list[dict], steps: int
) -> list[list[dict]]:
    frames = []
    for i in range(steps):
        t = i / max(steps - 1, 1)
        frame = [
            {"x": a["x"] + (b["x"] - a["x"]) * t, "y": a["y"] + (b["y"] - a["y"]) * t,
             "z": 0.0, "visibility": 0.99}
            for a, b in zip(pose_a, pose_b)
        ]
        frames.append(frame)
    return frames


async def create_synthetic_moves(
    difficulty: str,
    moves_col: AsyncIOMotorCollection,
) -> list[str]:
    """Insert 6 synthetic dance-pose moves into the DB and return their IDs.

    Each move animates from neutral → pose → neutral over 30 frames (~1 s at 30 fps).
    BPM range is set to [60, 200] so they match any song.
    """
    neutral = copy.deepcopy(_NEUTRAL_POSE)
    inserted_ids: list[str] = []
    half = 15  # frames per half-transition

    for overrides in _POSE_OVERRIDES:
        pose = _build_pose(overrides)
        keyframes = _interpolate_poses(neutral, pose, half) + _interpolate_poses(pose, neutral, half)
        move_id = str(ObjectId())
        await moves_col.insert_one({
            "_id": move_id,
            "keypoints": keyframes,
            "duration_ms": 1000,
            "bpm_range": [60, 200],
            "difficulty": difficulty,
            "genre_tags": ["synthetic"],
            "source_video_uri": "",
        })
        inserted_ids.append(move_id)

    return inserted_ids


async def assemble_sequence(
    bpm: int,
    difficulty: str,
    seed: int | None,
    moves_col: AsyncIOMotorCollection,
    target_duration_ms: int = 60_000,
) -> list[str]:
    """Sample moves from the pool to fill target_duration_ms.

    Filters by BPM range and difficulty, then randomly samples until the
    total duration meets or exceeds the target.
    """
    # Query moves matching BPM range and difficulty
    query = {
        "difficulty": difficulty,
        "bpm_range.0": {"$lte": bpm},
        "bpm_range.1": {"$gte": bpm},
    }

    candidates = []
    async for move in moves_col.find(query, {"_id": 1, "duration_ms": 1}):
        candidates.append(move)

    if not candidates:
        return []

    rng = random.Random(seed)
    sequence: list[str] = []
    total_ms = 0

    while total_ms < target_duration_ms:
        move = rng.choice(candidates)
        sequence.append(move["_id"])
        total_ms += move["duration_ms"]

    return sequence
