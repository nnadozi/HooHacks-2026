import tempfile
import uuid

from google.cloud import storage as gcs

from app.config import get_settings


def _get_bucket():
    settings = get_settings()
    client = gcs.Client(project=settings.GCS_PROJECT_ID)
    return client.bucket(settings.GCS_BUCKET_NAME)


async def upload_bytes(data: bytes, filename: str, content_type: str) -> str:
    """Upload raw bytes to GCS and return the gs:// URI."""
    settings = get_settings()
    bucket = _get_bucket()

    # Prefix with UUID to avoid collisions
    blob_name = f"uploads/{uuid.uuid4().hex}/{filename}"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)

    return f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"



def download_to_temp(uri: str) -> str:
    """Download a gs:// URI to a local temp file and return the path."""
    settings = get_settings()
    bucket = _get_bucket()

    # Parse gs://bucket/path
    prefix = f"gs://{settings.GCS_BUCKET_NAME}/"
    if not uri.startswith(prefix):
        raise ValueError(f"URI does not match configured bucket: {uri}")

    blob_name = uri[len(prefix):]
    blob = bucket.blob(blob_name)

    suffix = "." + blob_name.rsplit(".", 1)[-1] if "." in blob_name else ".tmp"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    blob.download_to_filename(tmp.name)
    return tmp.name
