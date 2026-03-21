from fastapi import APIRouter, HTTPException

from app.db import jobs_collection

router = APIRouter()


@router.get("/{job_id}")
async def get_job_status(job_id: str):
    job = await jobs_collection().find_one({"_id": job_id})
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"error": "Job not found", "code": "JOB_NOT_FOUND"},
        )

    return {
        "job_id": job["_id"],
        "status": job["status"],
        "result_id": job.get("result_id"),
    }
