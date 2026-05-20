from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models import Role, User
from app.schemas import SelfPasswordUpdate, Token, UserCreate, UserPasswordUpdate, UserRead, UserRoleUpdate, UserStatusUpdate
from app.security import authenticate_user, create_access_token, get_current_user, hash_password, require_roles, verify_password

router = APIRouter()


def get_manageable_user_or_404(db: Session, current_user: User, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if current_user.role == Role.librarian and user.role not in {Role.clinician, Role.reader}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Librarians may only manage clinician or reader accounts")
    return user


def validate_target_role(current_user: User, target_role: Role) -> None:
    if current_user.role == Role.librarian and target_role not in {Role.clinician, Role.reader}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Librarians may only assign clinician or reader roles")


@router.post("/token", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login")
    return Token(access_token=create_access_token(user))


@router.post("/bootstrap", response_model=UserRead)
def bootstrap_admin(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    if payload.role != Role.admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bootstrap can only create admin users")
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
    current_user: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> User:
    validate_target_role(current_user, payload.role)
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


@router.get("/users", response_model=list[UserRead])
def list_users(
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc(), User.email.asc())))


@router.patch("/users/{user_id}/status", response_model=UserRead)
def update_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    current_user: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> User:
    user = get_manageable_user_or_404(db, current_user, user_id)
    if current_user.id == user.id and not payload.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/password", response_model=UserRead)
def update_user_password(
    user_id: UUID,
    payload: UserPasswordUpdate,
    current_user: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> User:
    user = get_manageable_user_or_404(db, current_user, user_id)
    user.hashed_password = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    current_user: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> User:
    user = get_manageable_user_or_404(db, current_user, user_id)
    if current_user.id == user.id and payload.role != user.role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role")
    validate_target_role(current_user, payload.role)
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    current_user: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> None:
    user = get_manageable_user_or_404(db, current_user, user_id)
    if current_user.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    db.delete(user)
    db.commit()


@router.patch("/me/password", response_model=UserRead)
def change_own_password(
    payload: SelfPasswordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user
