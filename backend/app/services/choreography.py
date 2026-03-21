import random

from motor.motor_asyncio import AsyncIOMotorCollection


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
