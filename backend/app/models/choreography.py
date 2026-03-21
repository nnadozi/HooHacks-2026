from datetime import datetime

from pydantic import BaseModel, Field


class ChoreographyCreate(BaseModel):
    song_uri: str
    bpm: int
    difficulty: str = Field(pattern=r"^(easy|medium|hard)$")
    seed: int | None = None
    move_sequence: list[str]
    user_id: str


class ChoreographyDoc(ChoreographyCreate):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True}


class GenerateRequest(BaseModel):
    difficulty: str = Field(default="medium", pattern=r"^(easy|medium|hard)$")
    seed: int | None = None
