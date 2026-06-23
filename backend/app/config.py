"""Centralized application configuration loaded from environment variables."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if it exists (local development).
# In Cloud Run, these will be set via environment variables directly.
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# --- Required ---
MONGO_URL: str = os.environ["MONGO_URL"]
DB_NAME: str = os.environ["DB_NAME"]
JWT_SECRET: str = os.environ["JWT_SECRET"]

# --- JWT ---
JWT_ALGO: str = "HS256"

# --- External Services ---
EMERGENT_SESSION_URL: str = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
EMERGENT_LLM_KEY: str = os.environ.get("EMERGENT_LLM_KEY", "")

# --- BYOS (Bring Your Own Storage) ---
BYOS_FERNET_KEY: str = os.environ.get("BYOS_FERNET_KEY", "")
PUBLIC_APP_URL: str = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")

# --- Google Cloud Storage ---
GCS_BUCKET_NAME: str = os.environ.get("GCS_BUCKET_NAME", "")

# --- OAuth Provider Keys (BYOS) ---
GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")
MS_CLIENT_ID: str = os.environ.get("MS_CLIENT_ID", "")
MS_CLIENT_SECRET: str = os.environ.get("MS_CLIENT_SECRET", "")
