from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class FindingBase(BaseModel):
    record_no: str
    title: str = ""
    severity: str = "Orta"
    impact: str = ""
    description: str = ""
    recommendation: str = ""
    related_unit: str = ""
    related_person: str = ""
    status: str = "Devam Ediyor"
    due_date: date | None = None
    new_due_date: date | None = None
    note: str = ""


class FindingCreate(FindingBase):
    pass


class FindingUpdate(BaseModel):
    title: str | None = None
    severity: str | None = None
    impact: str | None = None
    description: str | None = None
    recommendation: str | None = None
    related_unit: str | None = None
    related_person: str | None = None
    status: str | None = None
    due_date: date | None = None
    new_due_date: date | None = None
    note: str | None = None


class FindingOut(FindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    updated_at: datetime
    created_at: datetime


class DashboardSummary(BaseModel):
    total: int
    closed: int
    open: int
    closure_rate: float
    last_work_time: datetime | None
    severity_rows: list[dict[str, int | str]]


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor: str
    action: str
    finding_id: int | None
    record_no: str | None
    detail: str
    created_at: datetime
