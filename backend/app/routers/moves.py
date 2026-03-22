import logging

from fastapi import APIRouter, HTTPException, Query

from app.db import moves_collection

logger = logging.getLogger("justdance.moves")
router = APIRouter()


@router.get("")
async def list_moves(
    difficulty: str | None = Query(default=None, pattern=r"^(easy|medium|hard)$"),
    genre_tag: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    include_keypoints: bool = False,
):
    query: dict = {}
    if difficulty:
        query["difficulty"] = difficulty
    if genre_tag:
        query["genre_tags"] = genre_tag

    projection = None
    if not include_keypoints:
        projection = {"keypoints": 0}

    moves = await moves_collection().find(query, projection).skip(skip).limit(limit).to_list(length=limit)
    logger.info(
        "Listed moves: count=%d, difficulty=%s, genre_tag=%s, include_keypoints=%s",
        len(moves),
        difficulty,
        genre_tag,
        include_keypoints,
    )

    for m in moves:
        m["id"] = m.pop("_id", "")

    return {"moves": moves}


@router.get("/{move_id}")
async def get_move(move_id: str):
    move = await moves_collection().find_one({"_id": move_id})
    if not move:
        raise HTTPException(
            status_code=404,
            detail={"error": "Move not found", "code": "MOVE_NOT_FOUND"},
        )

    move["id"] = move.pop("_id", "")
    return move
