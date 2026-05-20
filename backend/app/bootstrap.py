import logging

from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Role, User
from app.security import hash_password

log = logging.getLogger("medlib.bootstrap")


def ensure_root_admin() -> None:
    settings = get_settings()
    if not settings.root_admin_email or not settings.root_admin_password:
        log.info("ROOT_ADMIN_EMAIL or ROOT_ADMIN_PASSWORD not set – skipping bootstrap")
        return

    db = SessionLocal()
    try:
        email = settings.root_admin_email.lower().strip()
        log.info("Checking for root admin with email=%s", email)
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role = Role.admin
            user.is_active = True
            user.full_name = user.full_name or settings.root_admin_full_name
            if settings.root_admin_update_password:
                user.hashed_password = hash_password(settings.root_admin_password)
                log.info("Updated root admin password")
            db.commit()
            log.info("Root admin already exists (id=%s)", user.id)
            return

        user = User(
            email=email,
            full_name=settings.root_admin_full_name,
            hashed_password=hash_password(settings.root_admin_password),
            role=Role.admin,
            is_active=True,
        )
        db.add(user)
        db.commit()
        log.info("Created root admin with email=%s", email)
    except Exception:
        log.exception("Failed to create root admin")
        raise
    finally:
        db.close()
