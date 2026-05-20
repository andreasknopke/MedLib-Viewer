from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Role, User
from app.security import hash_password


def ensure_root_admin() -> None:
    settings = get_settings()
    if not settings.root_admin_email or not settings.root_admin_password:
        return

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == settings.root_admin_email.lower()))
        if user:
            user.role = Role.admin
            user.is_active = True
            user.full_name = user.full_name or settings.root_admin_full_name
            if settings.root_admin_update_password:
                user.hashed_password = hash_password(settings.root_admin_password)
            db.commit()
            return

        user = User(
            email=settings.root_admin_email.lower(),
            full_name=settings.root_admin_full_name,
            hashed_password=hash_password(settings.root_admin_password),
            role=Role.admin,
            is_active=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()
