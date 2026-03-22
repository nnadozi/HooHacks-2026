import json
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    MONGO_URI: str = ""
    MONGO_DB_NAME: str = "justdance"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Storage
    GCS_PROJECT_ID: str = ""
    GCS_BUCKET_NAME: str = ""

    # Vertex AI
    VERTEX_PROJECT_ID: str = ""
    GOOGLE_API_KEY: str = ""
    VERTEX_AI_LOCATION: str = "us-central1"

    # Auth0
    AUTH0_DOMAIN: str = ""
    AUTH0_AUDIENCE: str = ""

    # Scoring
    SCORE_THRESHOLDS: str = '{"perfect": 0.60, "good": 0.45, "ok": 0.25}'

    # Limits
    MAX_UPLOAD_SIZE_MB: int = 100
    GEMINI_DAILY_LIMIT: int = 10

    # Gemini
    # Use a Flash/Flash-Lite tier model for lower latency feedback generation.
    GEMINI_MODEL: str = "gemini-2.5-flash-lite"
    # Comma-separated list (or JSON array) of fallback model IDs to try if GEMINI_MODEL is unavailable.
    GEMINI_MODEL_FALLBACKS: str = "gemini-2.5-flash,gemini-2.0-flash"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Tools
    FFMPEG_PATH: str = Field(
        default="ffmpeg",
        validation_alias=AliasChoices("FFMPEG_PATH", "ffmpeg_path"),
    )

    # MediaPipe
    # If empty, the backend will use `backend/models/pose_landmarker_lite.task` and
    # attempt to download it automatically when first needed.
    MEDIAPIPE_POSE_MODEL_PATH: str = ""
    MEDIAPIPE_POSE_MODEL_URL: str = (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    )

    @property
    def score_thresholds_parsed(self) -> dict[str, float]:
        return json.loads(self.SCORE_THRESHOLDS)

    @property
    def allowed_origins_list(self) -> list[str]:
        # Empty ALLOWED_ORIGINS in .env becomes "" and would yield [""], which matches no browser Origin.
        origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        return origins if origins else ["http://localhost:3000"]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    model_config = {
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "env_file_encoding": "utf-8",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
