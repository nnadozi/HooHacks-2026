from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class GradeTier(str, Enum):
    PERFECT = "perfect"
    GOOD = "good"
    OK = "ok"
    MISS = "miss"


class Critique(BaseModel):
    timestamp_ms: int
    text: str


class GradeBreakdown(BaseModel):
    perfect: int = 0
    good: int = 0
    ok: int = 0
    miss: int = 0


class FeedbackCreate(BaseModel):
    choreography_id: str
    user_id: str
    score: int
    grade_breakdown: GradeBreakdown
    critiques: list[Critique]


class FeedbackDoc(FeedbackCreate):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True}
