from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from pymongo.database import Database

from app.config import get_settings

# --- Async client for FastAPI routes ---

_async_client: AsyncIOMotorClient | None = None


def get_async_db() -> AsyncIOMotorDatabase:
    global _async_client
    if _async_client is None:
        settings = get_settings()
        _async_client = AsyncIOMotorClient(settings.MONGO_URI)
    return _async_client[get_settings().MONGO_DB_NAME]


async def close_async_db() -> None:
    global _async_client
    if _async_client is not None:
        _async_client.close()
        _async_client = None


# Async collection accessors
def moves_collection():
    return get_async_db()["moves"]


def choreographies_collection():
    return get_async_db()["choreographies"]


def feedback_collection():
    return get_async_db()["feedback"]


def jobs_collection():
    return get_async_db()["jobs"]


def routines_collection():
    return get_async_db()["routines"]


# --- Sync client for Celery tasks ---

_sync_client: MongoClient | None = None


def get_sync_db() -> Database:
    global _sync_client
    if _sync_client is None:
        settings = get_settings()
        _sync_client = MongoClient(settings.MONGO_URI)
    return _sync_client[get_settings().MONGO_DB_NAME]


def sync_moves_collection():
    return get_sync_db()["moves"]


def sync_choreographies_collection():
    return get_sync_db()["choreographies"]


def sync_feedback_collection():
    return get_sync_db()["feedback"]


def sync_jobs_collection():
    return get_sync_db()["jobs"]


def sync_routines_collection():
    return get_sync_db()["routines"]
