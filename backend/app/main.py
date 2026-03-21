from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import close_async_db
from app.routers import choreography, feedback, jobs, users, videos

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_async_db()


app = FastAPI(title="JustDance AI", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(choreography.router, prefix="/api/choreography", tags=["choreography"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
