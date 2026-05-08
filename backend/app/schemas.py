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
    source: str = "Manuel"


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
    assigned_to: str | None = None


class FindingOut(FindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    closed_at: datetime | None = None
    closed_by: str | None = None
    assigned_to: str = ""
    last_action_at: datetime | None = None
    last_action_note: str = ""
    delay_days: int = 0
    sla_status: str = "Zamanında"
    active_due_date: date | None = None
    updated_at: datetime
    created_at: datetime


class ActionCreate(BaseModel):
    action_type: str = "note_added"
    note: str = ""
    old_value: str = ""
    new_value: str = ""


class FindingActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    finding_id: int
    action_type: str
    old_value: str
    new_value: str
    note: str
    created_by: str
    created_at: datetime


class BulkUpdate(BaseModel):
    ids: list[int]
    status: str | None = None
    related_person: str | None = None
    assigned_to: str | None = None
    due_date: date | None = None
    new_due_date: date | None = None
    note: str | None = None


class BulkIds(BaseModel):
    ids: list[int]
    note: str = "Toplu kapatma"


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


class SystemLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    message: str
    detail: str
    created_by: str
    created_at: datetime
