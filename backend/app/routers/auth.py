from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Role, User
from app.schemas import Token, UserCreate, UserRead
from app.security import authenticate_user, create_access_token, get_current_user, hash_password, require_roles

router = APIRouter()


@router.post("/token", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login")
    return Token(access_token=create_access_token(user))


@router.post("/bootstrap", response_model=UserRead)
def bootstrap_admin(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    user_count = db.scalar(select(func.count()).select_from(User))
    if user_count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bootstrap already completed")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=Role.admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/users", response_model=UserRead)
def create_user(
    payload: UserCreate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> User:
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user
