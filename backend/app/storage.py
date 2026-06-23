"""Google Cloud Storage upload utility.

When GCS_BUCKET_NAME is configured, media files are uploaded to GCS and a
public URL is returned.  When not configured, the original data (base64 or
URL) is returned unchanged — maintaining backward compatibility.
"""
import base64
import uuid
import logging
import re
from typing import Optional, Tuple

from app.config import GCS_BUCKET_NAME

logger = logging.getLogger(__name__)

# Lazy-loaded GCS client — only imported when a bucket is configured.
_gcs_client = None
_gcs_bucket = None


def _get_bucket():
    """Lazily initialise the GCS bucket handle."""
    global _gcs_client, _gcs_bucket
    if _gcs_bucket is not None:
        return _gcs_bucket
    if not GCS_BUCKET_NAME:
        return None
    try:
        from google.cloud import storage as gcs
        _gcs_client = gcs.Client()
        _gcs_bucket = _gcs_client.bucket(GCS_BUCKET_NAME)
        return _gcs_bucket
    except Exception as e:
        logger.warning(f"GCS initialisation failed (bucket={GCS_BUCKET_NAME}): {e}")
        return None


def _parse_data_uri(data_uri: str) -> Tuple[str, bytes]:
    """Parse a data URI into (mime_type, raw_bytes)."""
    m = re.match(r"data:(?P<mime>[^;]+);base64,(?P<data>.+)", data_uri, re.DOTALL)
    if not m:
        raw = data_uri.split(",")[-1] if "," in data_uri else data_uri
        return "image/jpeg", base64.b64decode(raw)
    return m.group("mime"), base64.b64decode(m.group("data"))


async def upload_to_gcs(data_uri: str, trip_id: str, prefix: str = "media") -> Optional[str]:
    """Upload a base64 data URI to GCS and return the public URL.

    Returns None if GCS is not configured or the input is not a data URI,
    in which case the caller should store the value as-is.
    """
    if not data_uri.startswith("data:"):
        return None  # Already a URL — nothing to do.

    bucket = _get_bucket()
    if bucket is None:
        return None  # GCS not configured — fall back to storing raw data URI.

    mime, file_bytes = _parse_data_uri(data_uri)
    ext = (mime.split("/")[-1] or "jpg").split("+")[0]
    filename = f"{uuid.uuid4().hex}.{ext}"
    blob_path = f"trips/{trip_id}/{prefix}/{filename}"

    try:
        blob = bucket.blob(blob_path)
        blob.upload_from_string(file_bytes, content_type=mime)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logger.warning(f"GCS upload failed for {blob_path}: {e}")
        return None
