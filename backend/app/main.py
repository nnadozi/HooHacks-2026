import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import close_async_db
from app.routers import choreography, feedback, jobs, users, videos

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("justdance")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting JustDance AI backend")
    yield
    await close_async_db()
    logger.info("Shut down JustDance AI backend")


app = FastAPI(title="JustDance AI", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled error on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("→ %s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info("← %s %s %d", request.method, request.url.path, response.status_code)
    return response


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(choreography.router, prefix="/api/choreography", tags=["choreography"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
