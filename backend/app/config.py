import json
from functools import lru_cache

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
    GOOGLE_API_KEY: str = ""
    VERTEX_AI_LOCATION: str = "us-central1"

    # Auth0
    AUTH0_DOMAIN: str = ""
    AUTH0_AUDIENCE: str = ""

    # Scoring
    SCORE_THRESHOLDS: str = '{"perfect": 0.75, "good": 0.60, "ok": 0.40}'

    # Limits
    MAX_UPLOAD_SIZE_MB: int = 100
    GEMINI_DAILY_LIMIT: int = 10

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def score_thresholds_parsed(self) -> dict[str, float]:
        return json.loads(self.SCORE_THRESHOLDS)

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
