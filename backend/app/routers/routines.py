import logging
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from app.db import moves_collection, routines_collection
from app.models.routine import RoutineCreateRequest, RoutineUpdate

logger = logging.getLogger("justdance.routines")
router = APIRouter()

DEV_USER_ID = "dev-user"


@router.get("")
async def list_routines():
    routines = await routines_collection().find({"user_id": DEV_USER_ID}).sort("created_at", -1).to_list(length=100)
    for r in routines:
        r["id"] = r.pop("_id", "")
    return {"routines": routines}


@router.post("")
async def create_routine(payload: RoutineCreateRequest):
    name = payload.name.strip()
    move_sequence = payload.move_sequence

    routine_id = str(ObjectId())
    doc = {
        "_id": routine_id,
        "name": name,
        "move_sequence": move_sequence,
        "user_id": DEV_USER_ID,
        "created_at": datetime.utcnow(),
        "updated_at": None,
    }
    await routines_collection().insert_one(doc)
    logger.info("Created routine %s (%d moves)", routine_id, len(move_sequence))

    return {"id": routine_id, "name": name, "move_count": len(move_sequence)}


@router.get("/{routine_id}")
async def get_routine(routine_id: str):
    routine = await routines_collection().find_one({"_id": routine_id, "user_id": DEV_USER_ID})
    if not routine:
        raise HTTPException(
            status_code=404,
            detail={"error": "Routine not found", "code": "ROUTINE_NOT_FOUND"},
        )
    routine["id"] = routine.pop("_id", "")
    return routine


@router.put("/{routine_id}")
async def update_routine(routine_id: str, payload: RoutineUpdate):
    routine = await routines_collection().find_one({"_id": routine_id, "user_id": DEV_USER_ID})
    if not routine:
        raise HTTPException(
            status_code=404,
            detail={"error": "Routine not found", "code": "ROUTINE_NOT_FOUND"},
        )

    update: dict = {"updated_at": datetime.utcnow()}
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.move_sequence is not None:
        update["move_sequence"] = payload.move_sequence

    await routines_collection().update_one({"_id": routine_id}, {"$set": update})
    logger.info("Updated routine %s", routine_id)
    return {"id": routine_id}


@router.get("/{routine_id}/preview")
async def get_routine_preview(routine_id: str):
    routine = await routines_collection().find_one({"_id": routine_id, "user_id": DEV_USER_ID})
    if not routine:
        raise HTTPException(
            status_code=404,
            detail={"error": "Routine not found", "code": "ROUTINE_NOT_FOUND"},
        )

    moves = []
    total_duration_ms = 0
    for move_id in routine.get("move_sequence", []):
        move = await moves_collection().find_one({"_id": move_id})
        if not move:
            continue
        moves.append(
            {
                "id": move["_id"],
                "keypoints": move.get("keypoints", []),
                "duration_ms": move.get("duration_ms", 0),
            }
        )
        total_duration_ms += int(move.get("duration_ms", 0) or 0)

    return {
        "id": routine_id,
        "name": routine.get("name", ""),
        "moves": moves,
        "total_duration_ms": total_duration_ms,
    }
