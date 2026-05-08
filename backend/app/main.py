from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .excel import build_export, import_findings, preview_findings
from .models import AuditLog, Finding, FindingAction, SEVERITIES, STATUS_CLOSED, STATUS_OPEN, STATUSES, SystemLog
from .schemas import ActionCreate, AuditLogOut, BulkIds, BulkUpdate, FindingActionOut, FindingCreate, FindingOut, FindingUpdate, SystemLogOut


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("findings")}
    additions = {
        "closed_at": "DATETIME",
        "closed_by": "VARCHAR(255)",
        "assigned_to": "VARCHAR(512) DEFAULT ''",
        "last_action_at": "DATETIME",
        "last_action_note": "TEXT DEFAULT ''",
        "delay_days": "INTEGER DEFAULT 0",
        "sla_status": "VARCHAR(32) DEFAULT 'Zamanında'",
    }
    with engine.begin() as conn:
        for column, ddl in additions.items():
            if column not in existing:
                conn.execute(text(f"ALTER TABLE findings ADD COLUMN {column} {ddl}"))


ensure_schema()

app = FastAPI(title="Kurumsal Güvenlik Bulgu Takip API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
legacy = APIRouter()


def actor(x_user: str | None = Header(default=None)) -> str:
    return x_user or "admin"


def active_due(finding: Finding) -> date | None:
    return finding.new_due_date or finding.due_date


def compute_sla(finding: Finding, today: date | None = None) -> tuple[str, int]:
    today = today or date.today()
    due = active_due(finding)
    if finding.status == STATUS_CLOSED:
        return "Kapalı", 0
    if due and due < today:
        return "Gecikti", (today - due).days
    if due and today <= due <= today + timedelta(days=7):
        return "Yaklaşıyor", 0
    return "Zamanında", 0


def refresh_sla(finding: Finding) -> None:
    finding.sla_status, finding.delay_days = compute_sla(finding)
    if not finding.assigned_to:
        finding.assigned_to = finding.related_person or ""


def serialize_detail(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def add_system_log(db: Session, event_type: str, message: str, detail: Any = "", current_actor: str = "system") -> None:
    if not isinstance(detail, str):
        detail = json.dumps(detail, ensure_ascii=False, default=str)
    db.add(SystemLog(event_type=event_type, message=message, detail=detail, created_by=current_actor))


def add_finding_action(db: Session, finding: Finding, action_type: str, current_actor: str, old_value: Any = "", new_value: Any = "", note: str = "") -> None:
    now = datetime.now(timezone.utc)
    db.add(
        FindingAction(
            finding_id=finding.id,
            action_type=action_type,
            old_value=serialize_detail(old_value),
            new_value=serialize_detail(new_value),
            note=note,
            created_by=current_actor,
        )
    )
    finding.last_action_at = now
    finding.last_action_note = note or action_type
    finding.updated_at = now


def log_action(db: Session, action: str, current_actor: str, detail: str = "", finding: Finding | None = None) -> None:
    db.add(AuditLog(actor=current_actor, action=action, finding_id=finding.id if finding else None, record_no=finding.record_no if finding else None, detail=detail))


def validate_choice(value: str, allowed: list[str], field_name: str) -> None:
    if value not in allowed:
        raise HTTPException(status_code=422, detail=f"{field_name} geçersiz: {value}")


def due_column() -> Any:
    return func.coalesce(Finding.new_due_date, Finding.due_date)


def query_open(db: Session) -> Any:
    return db.query(Finding).filter(Finding.status != STATUS_CLOSED)


def group_count(rows: list[tuple[str | None, int]], fallback: str = "Belirtilmedi") -> list[dict[str, Any]]:
    return [{"name": name or fallback, "count": count} for name, count in rows]


def as_out(finding: Finding) -> dict[str, Any]:
    refresh_sla(finding)
    data = FindingOut.model_validate(finding).model_dump(mode="json")
    data["active_due_date"] = active_due(finding).isoformat() if active_due(finding) else None
    return data


def findings_out(rows: list[Finding]) -> list[dict[str, Any]]:
    return [as_out(row) for row in rows]


def dashboard_data(db: Session) -> dict[str, Any]:
    today = date.today()
    rows_all = db.query(Finding).all()
    for f in rows_all:
        refresh_sla(f)
    total = len(rows_all)
    closed = len([f for f in rows_all if f.status == STATUS_CLOSED])
    open_rows = [f for f in rows_all if f.status != STATUS_CLOSED]
    delayed_rows = [f for f in open_rows if compute_sla(f, today)[0] == "Gecikti"]
    due_soon_rows = [f for f in open_rows if compute_sla(f, today)[0] == "Yaklaşıyor"]
    today_closed = len([f for f in rows_all if f.closed_at and f.closed_at.date() == today])
    week_start = today - timedelta(days=today.weekday())
    week_closed = len([f for f in rows_all if f.closed_at and f.closed_at.date() >= week_start])
    last_work_time = db.query(func.max(SystemLog.created_at)).scalar() or db.query(func.max(AuditLog.created_at)).scalar() or db.query(func.max(Finding.updated_at)).scalar()

    severity_rows: list[dict[str, int | str]] = []
    severity_counts: dict[str, int] = {}
    for severity in SEVERITIES:
        severity_total = len([f for f in rows_all if f.severity == severity])
        severity_closed = len([f for f in rows_all if f.severity == severity and f.status == STATUS_CLOSED])
        severity_counts[severity] = severity_total
        severity_rows.append({"severity": severity, "total": severity_total, "closed": severity_closed, "open": severity_total - severity_closed})
    severity_rows.append({"severity": "Toplam", "total": total, "closed": closed, "open": total - closed})

    open_by_unit = group_count(db.query(Finding.related_unit, func.count(Finding.id)).filter(Finding.status != STATUS_CLOSED).group_by(Finding.related_unit).order_by(func.count(Finding.id).desc()).limit(10).all(), "Birim belirtilmedi")
    open_by_person = group_count(db.query(Finding.related_person, func.count(Finding.id)).filter(Finding.status != STATUS_CLOSED).group_by(Finding.related_person).order_by(func.count(Finding.id).desc()).limit(10).all(), "Kişi belirtilmedi")
    priority_order = {"Acil": 0, "Kritik": 1, "Yüksek": 2, "Orta": 3, "Düşük": 4}
    critical_open = sorted(open_rows, key=lambda item: (priority_order.get(item.severity, 9), 0 if compute_sla(item, today)[0] == "Gecikti" else 1, active_due(item) or date.max))[:10]

    db.flush()
    return {
        "total": total,
        "closed": closed,
        "open": total - closed,
        "delayed": len(delayed_rows),
        "overdue": len(delayed_rows),
        "due_soon": len(due_soon_rows),
        "today_closed": today_closed,
        "week_closed": week_closed,
        "closure_rate": round((closed / total * 100), 2) if total else 0,
        "last_work_time": last_work_time,
        "severity_rows": severity_rows,
        "severity_counts": severity_counts,
        "status_distribution": [{"name": STATUS_OPEN, "count": total - closed}, {"name": STATUS_CLOSED, "count": closed}],
        "open_by_unit": open_by_unit,
        "open_by_person": open_by_person,
        "approaching_due": findings_out(sorted(due_soon_rows, key=lambda f: active_due(f) or date.max)[:10]),
        "overdue_findings": findings_out(sorted(delayed_rows, key=lambda f: active_due(f) or date.min)[:10]),
        "critical_open": findings_out(critical_open),
        "demo": total == 0,
    }


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bulgu-takip-api"}


@api.get("/metadata")
def metadata() -> dict[str, list[str]]:
    return {"statuses": STATUSES, "severities": SEVERITIES, "sla_statuses": ["Kapalı", "Gecikti", "Yaklaşıyor", "Zamanında"]}


@api.get("/findings/overdue")
def overdue_findings(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return findings_out(query_open(db).filter(due_column() < date.today()).order_by(due_column().asc()).all())


@api.get("/findings/due-soon")
def due_soon_findings(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    today = date.today()
    return findings_out(query_open(db).filter(due_column().between(today, today + timedelta(days=7))).order_by(due_column().asc()).all())


@api.get("/findings", response_model=list[FindingOut])
def list_findings(db: Session = Depends(get_db), severity: str | None = None, status: str | None = None, sla_status: str | None = None, related_unit: str | None = None, related_person: str | None = None, search: str | None = None, approaching_due: bool = False, overdue: bool = False, open_only: bool = False, closed_only: bool = False) -> list[dict[str, Any]]:
    query = db.query(Finding)
    if severity:
        query = query.filter(Finding.severity == severity)
    if status:
        query = query.filter(Finding.status == status)
    if related_unit:
        query = query.filter(Finding.related_unit.ilike(f"%{related_unit}%"))
    if related_person:
        query = query.filter(Finding.related_person.ilike(f"%{related_person}%"))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Finding.record_no.ilike(like), Finding.title.ilike(like), Finding.description.ilike(like), Finding.related_unit.ilike(like), Finding.related_person.ilike(like)))
    today = date.today()
    if approaching_due:
        query = query.filter(Finding.status != STATUS_CLOSED, due_column().between(today, today + timedelta(days=7)))
    if overdue:
        query = query.filter(Finding.status != STATUS_CLOSED, due_column() < today)
    if open_only:
        query = query.filter(Finding.status != STATUS_CLOSED)
    if closed_only:
        query = query.filter(Finding.status == STATUS_CLOSED)
    rows = query.order_by(Finding.updated_at.desc()).all()
    if sla_status:
        rows = [row for row in rows if compute_sla(row)[0] == sla_status]
    return findings_out(rows)


@api.get("/findings/{finding_id}", response_model=FindingOut)
def get_finding(finding_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    return as_out(finding)


@api.post("/findings", response_model=FindingOut)
def create_finding(payload: FindingCreate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    validate_choice(payload.severity, SEVERITIES, "Durum seviyesi")
    validate_choice(payload.status, STATUSES, "Durum")
    if db.query(Finding).filter(Finding.record_no == payload.record_no).one_or_none():
        raise HTTPException(status_code=409, detail="Bu kayıt no zaten var")
    finding = Finding(**payload.model_dump(), assigned_to=payload.related_person)
    refresh_sla(finding)
    if finding.status == STATUS_CLOSED:
        finding.closed_at = datetime.now(timezone.utc)
        finding.closed_by = current_actor
    db.add(finding)
    db.flush()
    add_finding_action(db, finding, "created", current_actor, note="Bulgu oluşturuldu")
    add_system_log(db, "finding_create", "Bulgu oluşturuldu", {"record_no": finding.record_no}, current_actor)
    log_action(db, "create", current_actor, "Bulgu oluşturuldu", finding)
    db.commit()
    db.refresh(finding)
    return as_out(finding)


def apply_update(db: Session, finding: Finding, data: dict[str, Any], current_actor: str, note: str = "Bulgu güncellendi") -> None:
    old = {key: getattr(finding, key) for key in data.keys() if hasattr(finding, key)}
    old_status = finding.status
    for key, value in data.items():
        if hasattr(finding, key):
            setattr(finding, key, value)
    if "related_person" in data and "assigned_to" not in data:
        finding.assigned_to = data["related_person"] or ""
    now = datetime.now(timezone.utc)
    if old_status != STATUS_CLOSED and finding.status == STATUS_CLOSED:
        finding.closed_at = now
        finding.closed_by = current_actor
        add_finding_action(db, finding, "closed", current_actor, old_status, finding.status, "Bulgu kapatıldı")
    elif old_status == STATUS_CLOSED and finding.status != STATUS_CLOSED:
        finding.closed_at = None
        finding.closed_by = None
        add_finding_action(db, finding, "reopened", current_actor, old_status, finding.status, "Bulgu tekrar açıldı")
    add_finding_action(db, finding, "updated", current_actor, old, data, note)
    if "status" in data and old.get("status") != data.get("status"):
        add_finding_action(db, finding, "status_changed", current_actor, old.get("status"), data.get("status"), "Durum değişti")
    if "severity" in data and old.get("severity") != data.get("severity"):
        add_finding_action(db, finding, "severity_changed", current_actor, old.get("severity"), data.get("severity"), "Durum seviyesi değişti")
    if ("due_date" in data and old.get("due_date") != data.get("due_date")) or ("new_due_date" in data and old.get("new_due_date") != data.get("new_due_date")):
        add_finding_action(db, finding, "due_date_changed", current_actor, {"due_date": old.get("due_date"), "new_due_date": old.get("new_due_date")}, {"due_date": finding.due_date, "new_due_date": finding.new_due_date}, "Termin değişti")
    if ("related_person" in data and old.get("related_person") != data.get("related_person")) or ("assigned_to" in data and old.get("assigned_to") != data.get("assigned_to")):
        add_finding_action(db, finding, "assigned", current_actor, old.get("related_person") or old.get("assigned_to"), finding.related_person or finding.assigned_to, "İlgili kişi atandı")
    refresh_sla(finding)


@api.put("/findings/{finding_id}", response_model=FindingOut)
@api.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(finding_id: int, payload: FindingUpdate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "severity" in data and data["severity"] is not None:
        validate_choice(data["severity"], SEVERITIES, "Durum seviyesi")
    if "status" in data and data["status"] is not None:
        validate_choice(data["status"], STATUSES, "Durum")
    apply_update(db, finding, data, current_actor)
    add_system_log(db, "finding_update", "Bulgu güncellendi", {"record_no": finding.record_no, "fields": list(data.keys())}, current_actor)
    log_action(db, "update", current_actor, "Bulgu güncellendi", finding)
    db.commit()
    db.refresh(finding)
    return as_out(finding)


@api.delete("/findings/{finding_id}")
def delete_finding(finding_id: int, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, str]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    add_system_log(db, "finding_delete", "Bulgu silindi", {"record_no": finding.record_no}, current_actor)
    log_action(db, "delete", current_actor, "Bulgu silindi", finding)
    db.delete(finding)
    db.commit()
    return {"message": "Bulgu silindi"}


@api.get("/findings/{finding_id}/actions", response_model=list[FindingActionOut])
def finding_actions(finding_id: int, db: Session = Depends(get_db)) -> list[FindingAction]:
    return db.query(FindingAction).filter(FindingAction.finding_id == finding_id).order_by(FindingAction.created_at.desc()).all()


@api.post("/findings/{finding_id}/actions", response_model=FindingActionOut)
def create_finding_action(finding_id: int, payload: ActionCreate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> FindingAction:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    add_finding_action(db, finding, payload.action_type or "note_added", current_actor, payload.old_value, payload.new_value, payload.note)
    if payload.action_type == "note_added" or payload.note:
        finding.note = "\n".join([x for x in [finding.note, payload.note] if x])
    refresh_sla(finding)
    db.commit()
    return db.query(FindingAction).filter(FindingAction.finding_id == finding_id).order_by(FindingAction.created_at.desc()).first()


@api.post("/findings/{finding_id}/close", response_model=FindingOut)
def close_finding(finding_id: int, payload: ActionCreate | None = None, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    apply_update(db, finding, {"status": STATUS_CLOSED}, current_actor, payload.note if payload else "Bulgu kapatıldı")
    db.commit()
    db.refresh(finding)
    return as_out(finding)


@api.post("/findings/{finding_id}/reopen", response_model=FindingOut)
def reopen_finding(finding_id: int, payload: ActionCreate | None = None, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    apply_update(db, finding, {"status": STATUS_OPEN}, current_actor, payload.note if payload else "Bulgu tekrar açıldı")
    db.commit()
    db.refresh(finding)
    return as_out(finding)


@api.post("/findings/bulk-update")
def bulk_update(payload: BulkUpdate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    data = payload.model_dump(exclude={"ids"}, exclude_unset=True)
    if "status" in data and data["status"]:
        validate_choice(data["status"], STATUSES, "Durum")
    updated = 0
    for finding in db.query(Finding).filter(Finding.id.in_(payload.ids)).all():
        apply_update(db, finding, data, current_actor, "Toplu güncelleme")
        updated += 1
    add_system_log(db, "finding_update", "Toplu bulgu güncelleme", {"ids": payload.ids, "fields": list(data.keys())}, current_actor)
    db.commit()
    return {"message": "Toplu güncelleme tamamlandı", "updated": updated}


@api.post("/findings/bulk-close")
def bulk_close(payload: BulkIds, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    closed = 0
    for finding in db.query(Finding).filter(Finding.id.in_(payload.ids)).all():
        apply_update(db, finding, {"status": STATUS_CLOSED}, current_actor, payload.note)
        closed += 1
    add_system_log(db, "finding_update", "Toplu bulgu kapatma", {"ids": payload.ids, "closed": closed}, current_actor)
    db.commit()
    return {"message": "Toplu kapatma tamamlandı", "closed": closed}


@api.post("/import/excel")
async def import_excel(file: UploadFile = File(...), preview: bool = Query(default=False), db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Sadece .xlsx veya .xlsm dosyası yükleyin")
    contents = await file.read()
    try:
        if preview:
            return preview_findings(contents, file.filename)
        result = import_findings(db, contents, file.filename, current_actor=current_actor, action_callback=add_finding_action)
    except ValueError as exc:
        add_system_log(db, "error", "Excel içe aktarma hatası", str(exc), current_actor)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        add_system_log(db, "error", "Excel içe aktarma başarısız", str(exc), current_actor)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Excel içe aktarma başarısız: {exc}") from exc
    add_system_log(db, "excel_import", "Excel içe aktarma tamamlandı", {"filename": file.filename, "created": result["created"], "updated": result["updated"], "failed": result["failed"], "time": datetime.now(timezone.utc)}, current_actor)
    log_action(db, "import", current_actor, f"{file.filename}: {result['created']} yeni, {result['updated']} güncellendi")
    db.commit()
    return result


@api.get("/export/excel")
def export_excel(db: Session = Depends(get_db), current_actor: str = Depends(actor), ids: str | None = None) -> StreamingResponse:
    query = db.query(Finding)
    if ids:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
        query = query.filter(Finding.id.in_(id_list))
    findings = query.order_by(Finding.record_no.asc()).all()
    for finding in findings:
        refresh_sla(finding)
    content = build_export(findings, dashboard_data(db))
    add_system_log(db, "excel_export", "Excel raporu dışa aktarıldı", {"count": len(findings), "ids": ids or "all"}, current_actor)
    log_action(db, "export", current_actor, "Excel raporu dışa aktarıldı")
    db.commit()
    filename = f"guvenlik-bulgu-raporu-{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    data = dashboard_data(db)
    add_system_log(db, "dashboard_view", "Dashboard görüntülendi", "", current_actor)
    db.commit()
    return data


@api.get("/logs", response_model=list[SystemLogOut])
def logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[SystemLog]:
    return db.query(SystemLog).order_by(SystemLog.created_at.desc()).limit(limit).all()


@api.get("/audit-logs", response_model=list[AuditLogOut])
def audit_logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()


# Backward-compatible routes.
legacy.add_api_route("/health", health, methods=["GET"])
legacy.add_api_route("/metadata", metadata, methods=["GET"])
legacy.add_api_route("/findings", list_findings, methods=["GET"], response_model=list[FindingOut])
legacy.add_api_route("/findings", create_finding, methods=["POST"], response_model=FindingOut)
legacy.add_api_route("/findings/{finding_id}", get_finding, methods=["GET"], response_model=FindingOut)
legacy.add_api_route("/findings/{finding_id}", update_finding, methods=["PATCH", "PUT"], response_model=FindingOut)
legacy.add_api_route("/findings/{finding_id}", delete_finding, methods=["DELETE"])
legacy.add_api_route("/import", import_excel, methods=["POST"])
legacy.add_api_route("/export", export_excel, methods=["GET"])
legacy.add_api_route("/dashboard", dashboard, methods=["GET"])
legacy.add_api_route("/logs", logs, methods=["GET"], response_model=list[SystemLogOut])

app.include_router(api)
app.include_router(legacy)
