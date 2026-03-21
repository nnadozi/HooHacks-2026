from datetime import datetime

from pydantic import BaseModel, Field


class Keypoint(BaseModel):
    x: float
    y: float
    z: float
    visibility: float


class MoveCreate(BaseModel):
    keypoints: list[list[Keypoint]]
    duration_ms: int
    bpm_range: tuple[int, int]
    difficulty: str = Field(pattern=r"^(easy|medium|hard)$")
    genre_tags: list[str] = []
    source_video_uri: str


class MoveDoc(MoveCreate):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True}
