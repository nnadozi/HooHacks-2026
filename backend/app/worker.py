from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "justdance",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Explicitly import task modules so they register with the app
import app.tasks.feedback  # noqa: F401, E402
import app.tasks.ingest  # noqa: F401, E402
