from datetime import datetime

from pydantic import BaseModel, Field


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    move_sequence: list[str] = Field(default_factory=list)
    user_id: str


class RoutineCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    move_sequence: list[str] = Field(default_factory=list)


class RoutineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    move_sequence: list[str] | None = None


class RoutineDoc(RoutineCreate):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime | None = None

    model_config = {"populate_by_name": True}
