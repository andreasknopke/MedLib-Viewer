from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Category, Clinic, Department, MediaPlacement, Role, User
from app.schemas import (
    CategoryCreate,
    CategoryRead,
    ClinicCreate,
    ClinicRead,
    DepartmentCreate,
    DepartmentRead,
    PlacementCreate,
    PlacementRead,
    PlacementUpdate,
)
from app.security import get_current_user, require_roles

router = APIRouter()


def placement_to_read(placement: MediaPlacement) -> PlacementRead:
    return PlacementRead(
        id=placement.id,
        book_id=placement.book_id,
        clinic_id=placement.clinic_id,
        department_id=placement.department_id,
        category_id=placement.category_id,
        clinic_name=placement.clinic.name if placement.clinic else None,
        department_name=placement.department.name if placement.department else None,
        category_name=placement.category.name if placement.category else None,
        created_at=placement.created_at,
    )


@router.get("/clinics", response_model=list[ClinicRead])
def list_clinics(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[Clinic]:
    return list(db.scalars(select(Clinic).order_by(Clinic.name.asc())))


@router.post("/clinics", response_model=ClinicRead, status_code=status.HTTP_201_CREATED)
def create_clinic(
    payload: ClinicCreate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Clinic:
    clinic = Clinic(**payload.model_dump())
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.delete("/clinics/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clinic(
    clinic_id: UUID,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> None:
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    db.delete(clinic)
    db.commit()


@router.get("/departments", response_model=list[DepartmentRead])
def list_departments(
    clinic_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Department]:
    statement = select(Department).order_by(Department.name.asc())
    if clinic_id:
        statement = statement.where(Department.clinic_id == clinic_id)
    return list(db.scalars(statement))


@router.post("/departments", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Department:
    if not db.get(Clinic, payload.clinic_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
    department = Department(**payload.model_dump())
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: UUID,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> None:
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    db.delete(department)
    db.commit()


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(
    department_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Category]:
    statement = select(Category).order_by(Category.name.asc())
    if department_id:
        statement = statement.where((Category.department_id == department_id) | (Category.department_id.is_(None)))
    return list(db.scalars(statement))


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Category:
    if payload.department_id and not db.get(Department, payload.department_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    category = Category(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: UUID,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> None:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    db.delete(category)
    db.commit()


@router.get("/placements", response_model=list[PlacementRead])
def list_placements(
    book_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PlacementRead]:
    statement = select(MediaPlacement).order_by(MediaPlacement.created_at.desc())
    if book_id:
        statement = statement.where(MediaPlacement.book_id == book_id)
    return [placement_to_read(placement) for placement in db.scalars(statement)]


@router.post("/placements", response_model=PlacementRead, status_code=status.HTTP_201_CREATED)
def create_placement(
    payload: PlacementCreate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> PlacementRead:
    if not db.get(Book, payload.book_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book or journal not found")
    department = db.get(Department, payload.department_id)
    if not db.get(Clinic, payload.clinic_id) or not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic or department not found")
    if department.clinic_id != payload.clinic_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department does not belong to clinic")
    if payload.category_id:
        category = db.get(Category, payload.category_id)
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category not found")
        if category.department_id is not None and category.department_id != payload.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category does not belong to department")
    placement = MediaPlacement(**payload.model_dump())
    db.add(placement)
    db.commit()
    db.refresh(placement)
    return placement_to_read(placement)


@router.patch("/placements/{placement_id}", response_model=PlacementRead)
def update_placement(
    placement_id: UUID,
    payload: PlacementUpdate,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> PlacementRead:
    placement = db.get(MediaPlacement, placement_id)
    if not placement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Placement not found")

    if payload.clinic_id is not None:
        if not db.get(Clinic, payload.clinic_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")
        placement.clinic_id = payload.clinic_id

    if payload.department_id is not None:
        department = db.get(Department, payload.department_id)
        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        if payload.clinic_id is not None and department.clinic_id != payload.clinic_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department does not belong to clinic")
        placement.department_id = payload.department_id

    if payload.category_id is not None:
        if payload.category_id == "":
            placement.category_id = None
        else:
            category = db.get(Category, payload.category_id)
            if not category:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category not found")
            if category.department_id is not None and category.department_id != placement.department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category does not belong to department")
            placement.category_id = payload.category_id

    db.commit()
    db.refresh(placement)
    return placement_to_read(placement)


@router.delete("/placements/{placement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_placement(
    placement_id: UUID,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> None:
    placement = db.get(MediaPlacement, placement_id)
    if not placement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Placement not found")
    db.delete(placement)
    db.commit()
