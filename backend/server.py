"""Thin wrapper around the modular app for backward compatibility."""
from app.main import app
from app.db import db, client
from app.auth import (
    get_current_user,
    require_member,
    user_public,
    now_utc,
    new_id,
    hash_password,
    verify_password,
    create_jwt,
    gen_invite_code,
)
