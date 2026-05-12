from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .services.defender_auth_service import DefenderAuthError
from .services.defender_service import DEFAULT_DEFENDER_API_BASE_URL, DefenderApiError, DefenderService
from .services.msrc_service import MsrcApiError, fetch_msrc_cvrf, normalize_msrc_items, parse_msrc_cvrf
from .excel import build_defender_affected_devices_export, build_defender_export, build_export, build_import_template, build_msrc_export, import_findings, preview_findings
from .models import AuditLog, DefenderMachineVulnerability, DefenderRecommendation, DefenderSettings, DefenderSyncLog, DefenderVulnerability, Finding, FindingAction, MsrcVulnerability, SEVERITIES, STATUS_CLOSED, STATUS_OPEN, STATUSES, SystemLog
from .schemas import ActionCreate, AuditLogOut, BulkIds, BulkUpdate, DefenderSettingsIn, FindingActionOut, FindingCreate, FindingOut, FindingUpdate, SystemLogOut


logger = logging.getLogger(__name__)


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

app = FastAPI(title="Risk ve Bulgu Yönetimi API")
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


def split_related_people(value: str | None) -> list[str]:
    return [part.strip() for part in re.split(r"[,;\n]+", value or "") if part.strip()]


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
        "defender_summary": {
            "total_cve": db.query(DefenderVulnerability).count(),
            "critical_cve": db.query(DefenderVulnerability).filter(DefenderVulnerability.severity == "Critical").count(),
            "high_cve": db.query(DefenderVulnerability).filter(DefenderVulnerability.severity == "High").count(),
            "affected_machines": db.query(DefenderMachineVulnerability.machine_id).distinct().count(),
            "public_exploit": db.query(DefenderVulnerability).filter(DefenderVulnerability.public_exploit == 1).count(),
            "converted_findings": db.query(Finding).filter(Finding.source == "Defender").count(),
        },
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
def list_findings(
    db: Session = Depends(get_db),
    severity: str | None = None,
    status: str | None = None,
    sla_status: str | None = None,
    related_unit: str | None = None,
    related_person: str | None = None,
    search: str | None = None,
    due_state: str | None = None,
    source: str | None = None,
    approaching_due: bool = False,
    overdue: bool = False,
    open_only: bool = False,
    closed_only: bool = False,
) -> list[dict[str, Any]]:
    query = db.query(Finding)
    if severity:
        query = query.filter(Finding.severity == severity)
    if status:
        query = query.filter(Finding.status == status)
    if related_unit:
        query = query.filter(Finding.related_unit == related_unit)
    if related_person:
        query = query.filter(Finding.related_person.ilike(f"%{related_person}%"))
    if source:
        if source == "Excel":
            query = query.filter(~Finding.source.in_(["Manuel", "MSRC", "Defender"]))
        else:
            query = query.filter(Finding.source == source)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(Finding.record_no.ilike(like), Finding.title.ilike(like), Finding.description.ilike(like), Finding.recommendation.ilike(like), Finding.related_unit.ilike(like), Finding.related_person.ilike(like)))
    today = date.today()
    if approaching_due or due_state == "Termin Yaklaşan":
        query = query.filter(Finding.status != STATUS_CLOSED, due_column().between(today, today + timedelta(days=7)))
    if overdue or due_state == "Geciken":
        query = query.filter(Finding.status != STATUS_CLOSED, due_column() < today)
    if due_state == "Terminsiz":
        query = query.filter(Finding.due_date.is_(None), Finding.new_due_date.is_(None))
    if open_only:
        query = query.filter(Finding.status != STATUS_CLOSED)
    if closed_only:
        query = query.filter(Finding.status == STATUS_CLOSED)
    rows = query.order_by(Finding.updated_at.desc()).all()
    if sla_status:
        rows = [row for row in rows if compute_sla(row)[0] == sla_status]
    return findings_out(rows)


@api.get("/findings/filter-options")
def finding_filter_options(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    def values(column: Any) -> list[str]:
        return sorted({str(value or "").strip() for (value,) in db.query(column).distinct().all() if str(value or "").strip()})

    raw_sources = values(Finding.source)
    source_labels = {"Excel" if src not in {"Manuel", "MSRC", "Defender"} else src for src in raw_sources}
    return {
        "related_units": values(Finding.related_unit),
        "related_people": sorted({person for value in values(Finding.related_person) for person in split_related_people(value)}),
        "sources": sorted(source_labels or {"Manuel", "Excel", "MSRC", "Defender"}),
        "severities": SEVERITIES,
        "statuses": STATUSES,
    }


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
        add_finding_action(db, finding, "closed", current_actor, old_status, finding.status, note or "Bulgu kapatıldı")
    elif old_status == STATUS_CLOSED and finding.status != STATUS_CLOSED:
        finding.closed_at = None
        finding.closed_by = None
        add_finding_action(db, finding, "reopened", current_actor, old_status, finding.status, note or "Bulgu tekrar açıldı")
    add_finding_action(db, finding, "updated", current_actor, old, data, note)
    if "status" in data and old.get("status") != data.get("status"):
        add_finding_action(db, finding, "status_changed", current_actor, old.get("status"), data.get("status"), note or "Durum değişti")
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


@api.get("/import/template")
def import_template() -> StreamingResponse:
    return StreamingResponse(BytesIO(build_import_template()), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=bulgu_import_sablonu.xlsx"})


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
    add_system_log(db, "dashboard_view", "Gösterge paneli görüntülendi", "", current_actor)
    db.commit()
    return data


@api.get("/logs", response_model=list[SystemLogOut])
def logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[SystemLog]:
    return db.query(SystemLog).order_by(SystemLog.created_at.desc()).limit(limit).all()


@api.get("/audit-logs", response_model=list[AuditLogOut])
def audit_logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()

# Microsoft Defender Vulnerability Management integration
DEFENDER_PERMISSIONS = ["Vulnerability.Read.All", "SecurityRecommendation.Read.All"]


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text_value = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text_value)
    except ValueError:
        return None


def truthy(value: Any) -> int:
    return 1 if value in (True, 1, "true", "True", "Yes", "yes") else 0


def get_defender_settings_row(db: Session, create: bool = True) -> DefenderSettings | None:
    row = db.query(DefenderSettings).order_by(DefenderSettings.id.asc()).first()
    if not row and create:
        row = DefenderSettings(api_base_url=DEFAULT_DEFENDER_API_BASE_URL)
        db.add(row)
        db.flush()
    return row


def defender_configured(settings: DefenderSettings | None) -> bool:
    return bool(settings and settings.integration_enabled and settings.tenant_id and settings.client_id and settings.client_secret_encrypted_or_masked)


def mask_secret(secret: str | None) -> str:
    if not secret:
        return ""
    return "********" if len(secret) < 12 else f"{secret[:2]}********{secret[-2:]}"


def settings_out(settings: DefenderSettings | None) -> dict[str, Any]:
    return {
        "tenant_id": settings.tenant_id if settings else "",
        "client_id": settings.client_id if settings else "",
        "client_secret": mask_secret(settings.client_secret_encrypted_or_masked if settings else ""),
        "api_base_url": settings.api_base_url if settings else DEFAULT_DEFENDER_API_BASE_URL,
        "integration_enabled": bool(settings.integration_enabled) if settings else False,
        "last_test_status": settings.last_test_status if settings else "not_tested",
        "last_test_message": settings.last_test_message if settings else "",
        "last_test_at": settings.last_test_at if settings else None,
        "last_sync_time": db_last_sync(settings) if settings else None,
        "required_permissions": DEFENDER_PERMISSIONS,
        "machine_permission_note": "Machine.Read.All gerekiyorsa ileride eklenebilir.",
    }


def db_last_sync(settings: DefenderSettings | None = None) -> datetime | None:
    # Filled per request in endpoints where a DB session is available when needed.
    return None


def serialize_model(row: Any) -> dict[str, Any]:
    data = {col.name: getattr(row, col.name) for col in row.__table__.columns}
    for key, value in list(data.items()):
        if isinstance(value, datetime):
            data[key] = value.isoformat()
    if "raw_json" in data:
        try:
            data["raw"] = json.loads(data["raw_json"] or "{}")
        except json.JSONDecodeError:
            data["raw"] = {}
    return data


def demo_defender_payload() -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    vulnerabilities = [
        {"id": 1, "cve_id": "CVE-2025-47111", "name": "Demo Windows bileşeni zafiyeti", "description": "Demo amaçlı kritik CVE kaydı.", "severity": "Critical", "cvss_v3": "9.8", "exposed_machines": 12, "public_exploit": 1, "exploit_verified": 1, "epss": "0.91", "published_on": now, "updated_on": now, "status": "Active", "msrc_match": False},
        {"id": 2, "cve_id": "CVE-2025-29988", "name": "Demo tarayıcı zafiyeti", "description": "Demo amaçlı yüksek seviye CVE kaydı.", "severity": "High", "cvss_v3": "8.1", "exposed_machines": 7, "public_exploit": 1, "exploit_verified": 0, "epss": "0.44", "published_on": now, "updated_on": now, "status": "Active", "msrc_match": False},
        {"id": 3, "cve_id": "CVE-2025-11820", "name": "Demo uygulama zafiyeti", "description": "Demo amaçlı orta seviye CVE kaydı.", "severity": "Medium", "cvss_v3": "6.5", "exposed_machines": 4, "public_exploit": 0, "exploit_verified": 0, "epss": "0.12", "published_on": now, "updated_on": now, "status": "Active", "msrc_match": False},
    ]
    machines = [
        {"id": 1, "machine_id": "demo-machine-001", "machine_name": "IST-LT-001", "cve_id": "CVE-2025-47111", "product_vendor": "Microsoft", "product_name": "Windows 11", "product_version": "23H2", "severity": "Critical", "fixing_kb_id": "KB5050001", "recommendation_id": "rec-demo-001", "remediation_status": "Open", "first_seen": now, "last_seen": now},
        {"id": 2, "machine_id": "demo-machine-002", "machine_name": "ANK-SRV-014", "cve_id": "CVE-2025-29988", "product_vendor": "Microsoft", "product_name": "Edge", "product_version": "124.0", "severity": "High", "fixing_kb_id": "", "recommendation_id": "rec-demo-002", "remediation_status": "Pending", "first_seen": now, "last_seen": now},
        {"id": 3, "machine_id": "demo-machine-003", "machine_name": "IZM-LT-009", "cve_id": "CVE-2025-11820", "product_vendor": "Contoso", "product_name": "Demo Agent", "product_version": "4.2.1", "severity": "Medium", "fixing_kb_id": "", "recommendation_id": "rec-demo-003", "remediation_status": "Open", "first_seen": now, "last_seen": now},
    ]
    recommendations = [
        {"id": 1, "recommendation_id": "rec-demo-001", "recommendation_name": "Windows güvenlik güncellemesini yükleyin", "product_name": "Windows 11", "vendor": "Microsoft", "recommendation_category": "Security updates", "severity_score": "9.8", "exposed_machines": 12, "remediation_type": "Update", "status": "Active", "exposure_impact": "High"},
        {"id": 2, "recommendation_id": "rec-demo-002", "recommendation_name": "Edge sürümünü güncelleyin", "product_name": "Edge", "vendor": "Microsoft", "recommendation_category": "Application", "severity_score": "8.1", "exposed_machines": 7, "remediation_type": "Upgrade", "status": "Active", "exposure_impact": "Medium"},
    ]
    return {"demo": True, "message": "Defender entegrasyonu yapılandırılmadı. Gösterilen veriler demo amaçlıdır.", "vulnerabilities": vulnerabilities, "machines": machines, "recommendations": recommendations}


def msrc_match_exists(db: Session, cve_id: str) -> bool:
    try:
        inspector = inspect(engine)
        for table in ["msrc_vulnerabilities", "msrc_cves", "microsoft_cves"]:
            if table in inspector.get_table_names():
                cols = {c["name"] for c in inspector.get_columns(table)}
                cve_col = "cve_id" if "cve_id" in cols else "cve" if "cve" in cols else None
                if cve_col:
                    return bool(db.execute(text(f"SELECT 1 FROM {table} WHERE {cve_col} = :cve LIMIT 1"), {"cve": cve_id}).first())
    except Exception:
        return False
    return False


def defender_dashboard_data(db: Session) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings) and db.query(DefenderVulnerability).count() == 0:
        demo = demo_defender_payload()
        vulns = demo["vulnerabilities"]
        machines = demo["machines"]
        recs = demo["recommendations"]
        demo_flag = True
    else:
        vulns = [serialize_model(x) for x in db.query(DefenderVulnerability).all()]
        machines = [serialize_model(x) for x in db.query(DefenderMachineVulnerability).all()]
        recs = [serialize_model(x) for x in db.query(DefenderRecommendation).all()]
        demo_flag = False
    severities = {s: len([v for v in vulns if str(v.get("severity", "")).lower() == s.lower()]) for s in ["Critical", "High", "Medium", "Low"]}
    products = sorted(({"name": k, "count": len([m for m in machines if m.get("product_name") == k])} for k in {m.get("product_name") or "Bilinmiyor" for m in machines}), key=lambda x: x["count"], reverse=True)[:10]
    machine_counts = sorted(({"name": k, "count": len([m for m in machines if m.get("machine_name") == k])} for k in {m.get("machine_name") or "Bilinmiyor" for m in machines}), key=lambda x: x["count"], reverse=True)[:10]
    vendors = sorted(({"name": k, "count": len([m for m in machines if m.get("product_vendor") == k])} for k in {m.get("product_vendor") or "Bilinmiyor" for m in machines}), key=lambda x: x["count"], reverse=True)[:10]
    rec_dist = sorted(({"name": k, "count": len([r for r in recs if r.get("remediation_type") == k])} for k in {r.get("remediation_type") or "Belirtilmedi" for r in recs}), key=lambda x: x["count"], reverse=True)
    last_sync = db.query(func.max(DefenderSyncLog.finished_at)).scalar()
    converted = db.query(Finding).filter(Finding.source == "Defender").count()
    return {
        "demo": demo_flag,
        "message": demo_defender_payload()["message"] if demo_flag else "",
        "total_cve": len(vulns),
        "critical_cve": severities["Critical"],
        "high_cve": severities["High"],
        "affected_machines": len({m.get("machine_id") or m.get("machine_name") for m in machines}),
        "exposed_applications": len({m.get("product_name") for m in machines if m.get("product_name")}),
        "public_exploit": len([v for v in vulns if v.get("public_exploit")]),
        "verified_exploit": len([v for v in vulns if v.get("exploit_verified")]),
        "pending_remediation": len([m for m in machines if str(m.get("remediation_status", "")).lower() not in {"fixed", "resolved", "completed"}]),
        "last_sync": last_sync.isoformat() if isinstance(last_sync, datetime) else None,
        "converted_findings": converted,
        "severity_distribution": [{"name": k, "count": v} for k, v in severities.items()],
        "top_applications": products,
        "top_machines": machine_counts,
        "vendor_distribution": vendors,
        "cve_trend": [{"name": (str(v.get("published_on") or "")[:10] or "Bilinmiyor"), "count": 1} for v in vulns[:20]],
        "recommendation_distribution": rec_dist,
    }


def map_defender_severity(value: str | None) -> str:
    return {"critical": "Kritik", "high": "Yüksek", "medium": "Orta", "low": "Düşük"}.get(str(value or "").lower(), "Orta")


def due_for_severity(severity: str) -> date:
    days = {"Kritik": 7, "Yüksek": 14, "Orta": 30, "Düşük": 60}.get(severity, 30)
    return date.today() + timedelta(days=days)


def upsert_log_start(db: Session, sync_type: str) -> DefenderSyncLog:
    log = DefenderSyncLog(sync_type=sync_type, status="running", started_at=datetime.now(timezone.utc))
    db.add(log)
    db.flush()
    return log


def sync_items(db: Session, sync_type: str, fetcher: Any, model: Any, key_fields: list[str], mapper: Any) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings):
        raise HTTPException(status_code=400, detail="Defender entegrasyonu yapılandırılmadı. Ayarlar ekranından Tenant ID, Client ID ve Client Secret bilgilerini girin.")
    log = upsert_log_start(db, sync_type)
    inserted = updated = errors = 0
    try:
        rows = fetcher(settings)
        for item in rows:
            try:
                values = mapper(item)
                query = db.query(model)
                for field in key_fields:
                    query = query.filter(getattr(model, field) == values[field])
                existing = query.one_or_none()
                if existing:
                    for key, value in values.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    db.add(model(**values))
                    inserted += 1
            except Exception:
                errors += 1
        log.status = "success" if errors == 0 else "partial"
        log.message = "Senkronizasyon tamamlandı"
        log.total_records = len(rows)
        log.inserted_count = inserted
        log.updated_count = updated
        log.error_count = errors
        log.finished_at = datetime.now(timezone.utc)
        db.commit()
        return {"status": log.status, "total_records": len(rows), "inserted_count": inserted, "updated_count": updated, "error_count": errors}
    except (DefenderApiError, DefenderAuthError) as exc:
        log.status = "failed"
        log.message = str(exc)
        log.error_count = 1
        log.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=getattr(exc, "status_code", 400), detail=str(exc)) from exc


def map_vulnerability(item: dict[str, Any]) -> dict[str, Any]:
    cve_id = item.get("id") or item.get("cveId") or item.get("cve_id") or item.get("name")
    return {"cve_id": str(cve_id), "name": item.get("name") or str(cve_id), "description": item.get("description") or "", "severity": item.get("severity") or "", "cvss_v3": str(item.get("cvssV3") or item.get("cvss_v3") or ""), "cvss_vector": item.get("cvssVector") or "", "exposed_machines": int(item.get("exposedMachines") or item.get("exposed_machines") or 0), "published_on": parse_dt(item.get("publishedOn") or item.get("published_on")), "updated_on": parse_dt(item.get("updatedOn") or item.get("updated_on")), "first_detected": parse_dt(item.get("firstDetected") or item.get("first_detected")), "public_exploit": truthy(item.get("publicExploit") or item.get("public_exploit")), "exploit_verified": truthy(item.get("exploitVerified") or item.get("exploit_verified")), "exploit_in_kit": truthy(item.get("exploitInKit") or item.get("exploit_in_kit")), "exploit_types": json.dumps(item.get("exploitTypes") or item.get("exploit_types") or [], ensure_ascii=False), "epss": str(item.get("epss") or ""), "status": item.get("status") or "Active", "raw_json": json.dumps(item, ensure_ascii=False, default=str), "synced_at": datetime.now(timezone.utc)}


def map_machine_vulnerability(item: dict[str, Any]) -> dict[str, Any]:
    return {"cve_id": str(item.get("cveId") or item.get("cve_id") or item.get("id") or ""), "machine_id": str(item.get("machineId") or item.get("machine_id") or ""), "machine_name": item.get("machineName") or item.get("computerDnsName") or item.get("machine_name") or "", "product_vendor": item.get("productVendor") or item.get("product_vendor") or "", "product_name": item.get("productName") or item.get("product_name") or "", "product_version": item.get("productVersion") or item.get("product_version") or "", "severity": item.get("severity") or "", "fixing_kb_id": item.get("fixingKbId") or item.get("fixing_kb_id") or "", "recommendation_id": item.get("recommendationId") or item.get("recommendation_id") or "", "remediation_status": item.get("remediationStatus") or item.get("remediation_status") or "Open", "first_seen": parse_dt(item.get("firstSeen") or item.get("first_seen")), "last_seen": parse_dt(item.get("lastSeen") or item.get("last_seen")), "raw_json": json.dumps(item, ensure_ascii=False, default=str), "synced_at": datetime.now(timezone.utc)}



def first_nonempty(*values: Any, default: str = "-") -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def machine_reference_map(references: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(ref.get("id") or ""): ref for ref in references if ref.get("id")}


def affected_device_payload(item: dict[str, Any], reference: dict[str, Any] | None = None) -> dict[str, Any]:
    reference = reference or {}
    machine_id = first_nonempty(item.get("machineId"), item.get("machine_id"), item.get("id"), default="")
    return {
        "device_id": machine_id or "-",
        "device_name": first_nonempty(reference.get("computerDnsName"), reference.get("deviceName"), item.get("machineName"), item.get("computerDnsName"), item.get("machine_name"), machine_id),
        "os_platform": first_nonempty(reference.get("osPlatform"), item.get("osPlatform"), item.get("os_platform")),
        "rbac_group_name": first_nonempty(reference.get("rbacGroupName"), item.get("rbacGroupName"), item.get("rbac_group_name")),
        "product_vendor": first_nonempty(item.get("productVendor"), item.get("product_vendor"), default=""),
        "product_name": first_nonempty(item.get("productName"), item.get("product_name"), default=""),
        "product_version": first_nonempty(item.get("productVersion"), item.get("product_version"), default=""),
        "cve_id": first_nonempty(item.get("cveId"), item.get("cve_id"), default=""),
        "severity": first_nonempty(item.get("severity"), default=""),
        "fixing_kb_id": first_nonempty(item.get("fixingKbId"), item.get("fixing_kb_id"), default=""),
        "first_seen": parse_dt(reference.get("firstSeen") or item.get("firstSeen") or item.get("first_seen")),
        "last_seen": parse_dt(reference.get("lastSeen") or item.get("lastSeen") or item.get("last_seen")),
    }


def serialize_affected_device(device: dict[str, Any]) -> dict[str, Any]:
    data = dict(device)
    for key in ("first_seen", "last_seen"):
        if isinstance(data.get(key), datetime):
            data[key] = data[key].isoformat()
    return data


def db_machine_item(row: DefenderMachineVulnerability) -> dict[str, Any]:
    data = serialize_model(row)
    data["machineId"] = data.get("machine_id")
    return data


def affected_devices_from_db(db: Session, cve_id: str, product_vendor: str | None = None, product_name: str | None = None, product_version: str | None = None) -> list[dict[str, Any]]:
    query = db.query(DefenderMachineVulnerability).filter(DefenderMachineVulnerability.cve_id == cve_id)
    if product_vendor:
        query = query.filter(DefenderMachineVulnerability.product_vendor == product_vendor)
    if product_name:
        query = query.filter(DefenderMachineVulnerability.product_name == product_name)
    if product_version:
        query = query.filter(DefenderMachineVulnerability.product_version == product_version)
    return [affected_device_payload(db_machine_item(row)) for row in query.order_by(DefenderMachineVulnerability.last_seen.desc()).all()]


def fetch_affected_devices(settings: DefenderSettings, cve_id: str, product_vendor: str | None = None, product_name: str | None = None, product_version: str | None = None) -> tuple[list[dict[str, Any]], str | None]:
    service = DefenderService()
    filters: dict[str, Any] = {"$filter": f"cveId eq '{cve_id}'"}
    machine_items = service.machines_vulnerabilities(settings, **filters)
    if product_vendor:
        machine_items = [item for item in machine_items if first_nonempty(item.get("productVendor"), item.get("product_vendor"), default="") == product_vendor]
    if product_name:
        machine_items = [item for item in machine_items if first_nonempty(item.get("productName"), item.get("product_name"), default="") == product_name]
    if product_version:
        machine_items = [item for item in machine_items if first_nonempty(item.get("productVersion"), item.get("product_version"), default="") == product_version]
    references: list[dict[str, Any]] = []
    warning: str | None = None
    try:
        references = service.machine_references(settings, cve_id)
    except (DefenderApiError, DefenderAuthError):
        warning = "Cihaz adları alınamadı, cihaz ID bilgisi gösteriliyor."
    ref_by_id = machine_reference_map(references)
    devices = [affected_device_payload(item, ref_by_id.get(str(item.get("machineId") or item.get("machine_id") or ""))) for item in machine_items]
    return devices, warning

def map_recommendation(item: dict[str, Any]) -> dict[str, Any]:
    rec_id = item.get("id") or item.get("recommendationId") or item.get("recommendation_id")
    return {"recommendation_id": str(rec_id), "product_name": item.get("productName") or item.get("product_name") or "", "vendor": item.get("vendor") or item.get("productVendor") or "", "recommendation_name": item.get("recommendationName") or item.get("recommendation_name") or item.get("name") or "", "recommendation_category": item.get("recommendationCategory") or item.get("category") or "", "severity_score": str(item.get("severityScore") or item.get("severity_score") or ""), "exposed_machines": int(item.get("exposedMachines") or item.get("exposed_machines") or 0), "remediation_type": item.get("remediationType") or item.get("remediation_type") or "", "status": item.get("status") or "Active", "config_score_impact": str(item.get("configScoreImpact") or ""), "exposure_impact": str(item.get("exposureImpact") or ""), "raw_json": json.dumps(item, ensure_ascii=False, default=str), "synced_at": datetime.now(timezone.utc)}


@api.get("/defender/health")
def defender_health(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    return {"status": "ok", "module": "Microsoft Defender Vulnerability Management", "configured": defender_configured(settings), "demo": not defender_configured(settings), "api_base_url": settings.api_base_url if settings else DEFAULT_DEFENDER_API_BASE_URL}


@api.get("/defender/settings")
def get_defender_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_defender_settings_row(db)
    out = settings_out(settings)
    out["last_sync_time"] = db.query(func.max(DefenderSyncLog.finished_at)).scalar()
    return out


@api.put("/defender/settings")
def update_defender_settings(payload: DefenderSettingsIn, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    settings = get_defender_settings_row(db)
    settings.tenant_id = payload.tenant_id.strip()
    settings.client_id = payload.client_id.strip()
    if payload.client_secret and not payload.client_secret.startswith("****"):
        settings.client_secret_encrypted_or_masked = payload.client_secret
    settings.api_base_url = (payload.api_base_url or DEFAULT_DEFENDER_API_BASE_URL).strip().rstrip("/")
    settings.integration_enabled = 1 if payload.integration_enabled else 0
    settings.updated_at = datetime.now(timezone.utc)
    add_system_log(db, "defender_settings", "Defender ayarları güncellendi", {"api_base_url": settings.api_base_url, "enabled": bool(settings.integration_enabled)}, current_actor)
    db.commit()
    return get_defender_settings(db)


@api.post("/defender/test-connection")
def defender_test_connection(db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings):
        raise HTTPException(status_code=400, detail="Defender entegrasyonu yapılandırılmadı. Tenant ID, Client ID ve Client Secret bilgilerini kontrol edin.")
    try:
        service = DefenderService()
        service.vulnerabilities(settings, **{"$top": 1})
        settings.last_test_status = "success"
        settings.last_test_message = "Bağlantı başarılı."
        settings.last_test_at = datetime.now(timezone.utc)
        add_system_log(db, "defender_test", "Defender bağlantı testi başarılı", "", current_actor)
        db.commit()
        return {"status": "success", "message": "Bağlantı başarılı."}
    except (DefenderApiError, DefenderAuthError) as exc:
        settings.last_test_status = "failed"
        settings.last_test_message = str(exc)
        settings.last_test_at = datetime.now(timezone.utc)
        add_system_log(db, "defender_test", "Defender bağlantı testi başarısız", str(exc), current_actor)
        db.commit()
        raise HTTPException(status_code=getattr(exc, "status_code", 400), detail=str(exc)) from exc


@api.post("/defender/sync/vulnerabilities")
def sync_defender_vulnerabilities(db: Session = Depends(get_db)) -> dict[str, Any]:
    return sync_items(db, "vulnerabilities", lambda s: DefenderService().vulnerabilities(s), DefenderVulnerability, ["cve_id"], map_vulnerability)


@api.post("/defender/sync/machines-vulnerabilities")
def sync_defender_machines_vulnerabilities(db: Session = Depends(get_db)) -> dict[str, Any]:
    return sync_items(db, "machines_vulnerabilities", lambda s: DefenderService().machines_vulnerabilities(s), DefenderMachineVulnerability, ["cve_id", "machine_id", "product_name", "product_version"], map_machine_vulnerability)


@api.post("/defender/sync/recommendations")
def sync_defender_recommendations(db: Session = Depends(get_db)) -> dict[str, Any]:
    return sync_items(db, "recommendations", lambda s: DefenderService().recommendations(s), DefenderRecommendation, ["recommendation_id"], map_recommendation)


@api.post("/defender/sync/all")
def sync_defender_all(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"vulnerabilities": sync_defender_vulnerabilities(db), "machines_vulnerabilities": sync_defender_machines_vulnerabilities(db), "recommendations": sync_defender_recommendations(db)}


@api.get("/defender/vulnerabilities")
def list_defender_vulnerabilities(db: Session = Depends(get_db), cve_id: str | None = None, severity: str | None = None, product_name: str | None = None, exposed_machines_min: int | None = None, public_exploit: bool | None = None, exploit_verified: bool | None = None, status: str | None = None) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings) and db.query(DefenderVulnerability).count() == 0:
        return {"demo": True, "message": demo_defender_payload()["message"], "items": demo_defender_payload()["vulnerabilities"]}
    query = db.query(DefenderVulnerability)
    if cve_id: query = query.filter(DefenderVulnerability.cve_id.ilike(f"%{cve_id}%"))
    if severity: query = query.filter(DefenderVulnerability.severity == severity)
    if exposed_machines_min is not None: query = query.filter(DefenderVulnerability.exposed_machines >= exposed_machines_min)
    if public_exploit is not None: query = query.filter(DefenderVulnerability.public_exploit == truthy(public_exploit))
    if exploit_verified is not None: query = query.filter(DefenderVulnerability.exploit_verified == truthy(exploit_verified))
    if status: query = query.filter(DefenderVulnerability.status == status)
    rows = query.order_by(DefenderVulnerability.exposed_machines.desc()).all()
    if product_name:
        cves = {m.cve_id for m in db.query(DefenderMachineVulnerability).filter(DefenderMachineVulnerability.product_name.ilike(f"%{product_name}%")).all()}
        rows = [row for row in rows if row.cve_id in cves]
    items = []
    for row in rows:
        sample_rows = db.query(DefenderMachineVulnerability).filter(DefenderMachineVulnerability.cve_id == row.cve_id).order_by(DefenderMachineVulnerability.last_seen.desc()).limit(5).all()
        sample_devices = [first_nonempty(sample.machine_name, sample.machine_id) for sample in sample_rows]
        items.append(serialize_model(row) | {"msrc_match": msrc_match_exists(db, row.cve_id), "sample_devices": sample_devices})
    return {"demo": False, "items": items}


@api.get("/defender/machines-vulnerabilities")
def list_defender_machine_vulnerabilities(db: Session = Depends(get_db), machine_name: str | None = None, product_vendor: str | None = None, product_name: str | None = None, product_version: str | None = None, cve_id: str | None = None, severity: str | None = None, fixing_kb_id: str | None = None) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings) and db.query(DefenderMachineVulnerability).count() == 0:
        return {"demo": True, "message": demo_defender_payload()["message"], "items": demo_defender_payload()["machines"]}
    query = db.query(DefenderMachineVulnerability)
    for field, value in {"machine_name": machine_name, "product_vendor": product_vendor, "product_name": product_name, "product_version": product_version, "cve_id": cve_id, "severity": severity, "fixing_kb_id": fixing_kb_id}.items():
        if value:
            query = query.filter(getattr(DefenderMachineVulnerability, field).ilike(f"%{value}%"))
    return {"demo": False, "items": [serialize_model(row) for row in query.order_by(DefenderMachineVulnerability.last_seen.desc()).all()]}


@api.get("/defender/recommendations")
def list_defender_recommendations(db: Session = Depends(get_db), product_name: str | None = None, vendor: str | None = None, status: str | None = None) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if not defender_configured(settings) and db.query(DefenderRecommendation).count() == 0:
        return {"demo": True, "message": demo_defender_payload()["message"], "items": demo_defender_payload()["recommendations"]}
    query = db.query(DefenderRecommendation)
    if product_name: query = query.filter(DefenderRecommendation.product_name.ilike(f"%{product_name}%"))
    if vendor: query = query.filter(DefenderRecommendation.vendor.ilike(f"%{vendor}%"))
    if status: query = query.filter(DefenderRecommendation.status == status)
    return {"demo": False, "items": [serialize_model(row) for row in query.order_by(DefenderRecommendation.exposed_machines.desc()).all()]}


@api.get("/defender/vulnerabilities/{cve_id}/affected-devices")
def get_defender_affected_devices(cve_id: str, product_vendor: str | None = None, product_name: str | None = None, product_version: str | None = None, db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = get_defender_settings_row(db, create=False)
    if defender_configured(settings):
        try:
            devices, warning = fetch_affected_devices(settings, cve_id, product_vendor, product_name, product_version)
            return {"items": [serialize_affected_device(device) for device in devices], "warning": warning}
        except (DefenderApiError, DefenderAuthError) as exc:
            cached_devices = affected_devices_from_db(db, cve_id, product_vendor, product_name, product_version)
            if cached_devices:
                return {"items": [serialize_affected_device(device) for device in cached_devices], "warning": "Defender cihaz detayları alınamadı, kayıtlı bilgiler gösteriliyor."}
            raise HTTPException(status_code=getattr(exc, "status_code", 400), detail=str(exc)) from exc
    if db.query(DefenderMachineVulnerability).count() == 0:
        devices = [affected_device_payload(item) for item in demo_defender_payload()["machines"] if item["cve_id"] == cve_id]
    else:
        devices = affected_devices_from_db(db, cve_id, product_vendor, product_name, product_version)
    return {"items": [serialize_affected_device(device) for device in devices], "warning": None}


@api.get("/defender/vulnerabilities/{cve_id}/affected-devices/export")
def export_defender_affected_devices(cve_id: str, product_vendor: str | None = None, product_name: str | None = None, product_version: str | None = None, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> StreamingResponse:
    payload = get_defender_affected_devices(cve_id, product_vendor, product_name, product_version, db)
    content = build_defender_affected_devices_export(payload["items"])
    add_system_log(db, "defender_affected_devices_export", "Defender etkilenen cihaz listesi dışa aktarıldı", {"cve_id": cve_id, "count": len(payload["items"])}, current_actor)
    db.commit()
    filename = f"defender-{cve_id}-etkilenen-cihazlar.xlsx"
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/defender/dashboard")
def defender_dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    return defender_dashboard_data(db)


@api.post("/defender/vulnerabilities/{cve_id}/convert-to-finding")
def convert_defender_vulnerability(cve_id: str, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    row = db.query(DefenderVulnerability).filter(DefenderVulnerability.cve_id == cve_id).one_or_none()
    if not row:
        demo_row = next((x for x in demo_defender_payload()["vulnerabilities"] if x["cve_id"] == cve_id), None)
        if not demo_row:
            raise HTTPException(status_code=404, detail="Defender CVE kaydı bulunamadı")
        severity = map_defender_severity(demo_row.get("severity"))
        title = f"{cve_id} - Demo Defender CVE"
        description = demo_row.get("description", "")
        recommendation = "Defender önerilerini ve üretici güvenlik güncellemelerini uygulayın."
        product_key = "Demo"
    else:
        severity = map_defender_severity(row.severity)
        title = f"{row.cve_id} - {row.name}"
        description = row.description
        recommendation = "İlgili Defender güvenlik önerisini uygulayın."
        product_key = row.name
    duplicate = db.query(Finding).filter(Finding.source == "Defender", Finding.note.ilike(f"%CVE: {cve_id}%"), Finding.note.ilike(f"%Ürün: {product_key}%")).one_or_none()
    if duplicate:
        return {"status": "duplicate", "message": "Bu CVE ve ürün için daha önce bulgu oluşturulmuş.", "finding": as_out(duplicate)}
    record_no = f"DEF-{cve_id}"
    suffix = 1
    base = record_no
    while db.query(Finding).filter(Finding.record_no == record_no).one_or_none():
        suffix += 1
        record_no = f"{base}-{suffix}"
    finding = Finding(record_no=record_no, title=title, severity=severity, description=description, recommendation=recommendation, related_unit="Bilgi Teknolojileri", related_person="", status=STATUS_OPEN, due_date=due_for_severity(severity), note=f"Defender kaynak bilgisi\nCVE: {cve_id}\nÜrün: {product_key}", source="Defender")
    db.add(finding); db.flush()
    add_finding_action(db, finding, "created_from_defender", current_actor, note="Defender CVE kaydından bulgu oluşturuldu")
    add_system_log(db, "defender_convert", "Defender CVE bulguya dönüştürüldü", {"cve_id": cve_id, "record_no": record_no}, current_actor)
    db.commit(); db.refresh(finding)
    return {"status": "created", "finding": as_out(finding)}


@api.post("/defender/machines-vulnerabilities/convert-to-finding")
def convert_defender_machine_vulnerability(payload: dict[str, Any], db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    cve_id = payload.get("cve_id")
    machine_id = payload.get("machine_id")
    row = db.query(DefenderMachineVulnerability).filter(DefenderMachineVulnerability.cve_id == cve_id, DefenderMachineVulnerability.machine_id == machine_id).first() if cve_id and machine_id else None
    if not row:
        demo_row = next((x for x in demo_defender_payload()["machines"] if x["cve_id"] == cve_id and x["machine_id"] == machine_id), None)
        if not demo_row:
            raise HTTPException(status_code=404, detail="Defender cihaz/zafiyet kaydı bulunamadı")
        data = demo_row
    else:
        data = serialize_model(row)
    severity = map_defender_severity(data.get("severity"))
    duplicate = db.query(Finding).filter(Finding.source == "Defender", Finding.note.ilike(f"%CVE: {cve_id}%"), Finding.note.ilike(f"%Cihaz ID: {machine_id}%")).one_or_none()
    if duplicate:
        return {"status": "duplicate", "message": "Bu CVE ve cihaz için daha önce bulgu oluşturulmuş.", "finding": as_out(duplicate)}
    record_no = f"DEF-{cve_id}-MACHINE"
    suffix = 1; base = record_no
    while db.query(Finding).filter(Finding.record_no == record_no).one_or_none():
        suffix += 1; record_no = f"{base}-{suffix}"
    finding = Finding(record_no=record_no, title=f"{cve_id} - {data.get('product_name')}", severity=severity, description=f"Defender cihaz zafiyeti: {cve_id}. Cihaz: {data.get('machine_name')} ({machine_id}). Uygulama: {data.get('product_name')} {data.get('product_version')}", recommendation=f"Recommendation ID: {data.get('recommendation_id') or '-'}; Fixing KB: {data.get('fixing_kb_id') or '-'}", related_unit="Bilgi Teknolojileri", related_person="", status=STATUS_OPEN, due_date=due_for_severity(severity), note=f"Defender kaynak bilgisi\nCVE: {cve_id}\nCihaz ID: {machine_id}\nCihaz Adı: {data.get('machine_name')}\nÜrün: {data.get('product_name')}\nVersiyon: {data.get('product_version')}", source="Defender")
    db.add(finding); db.flush()
    add_finding_action(db, finding, "created_from_defender", current_actor, note="Defender cihaz/zafiyet kaydından bulgu oluşturuldu")
    add_system_log(db, "defender_convert", "Defender cihaz zafiyeti bulguya dönüştürüldü", {"cve_id": cve_id, "machine_id": machine_id, "record_no": record_no}, current_actor)
    db.commit(); db.refresh(finding)
    return {"status": "created", "finding": as_out(finding)}


@api.get("/defender/export/excel")
def export_defender_excel(db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> StreamingResponse:
    dashboard_payload = defender_dashboard_data(db)
    vulns = list_defender_vulnerabilities(db)["items"]
    machines = list_defender_machine_vulnerabilities(db)["items"]
    recs = list_defender_recommendations(db)["items"]
    content = build_defender_export(dashboard_payload, vulns, machines, recs)
    add_system_log(db, "defender_export", "Defender Excel raporu dışa aktarıldı", {"cve": len(vulns), "machines": len(machines), "recommendations": len(recs)}, current_actor)
    db.commit()
    filename = f"defender-zafiyet-raporu-{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


MSRC_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def msrc_months(count: int = 12, start: date | None = None) -> list[str]:
    current = start or date.today()
    year = current.year
    month_index = current.month - 1
    result: list[str] = []
    for _ in range(count):
        result.append(f"{year}-{MSRC_MONTH_NAMES[month_index]}")
        month_index -= 1
        if month_index < 0:
            month_index = 11
            year -= 1
    return result


def msrc_bool(value: Any) -> bool:
    return bool(int(value or 0))


def serialize_msrc(row: MsrcVulnerability) -> dict[str, Any]:
    data = serialize_model(row)
    data["publicly_disclosed"] = msrc_bool(data.get("publicly_disclosed"))
    data["exploited"] = msrc_bool(data.get("exploited"))
    if isinstance(row.release_date, date):
        data["release_date"] = row.release_date.isoformat()
    return data


def msrc_filtered_query(
    db: Session,
    severity: str | None = None,
    cve: str | None = None,
    product: str | None = None,
    kb: str | None = None,
    month: str | None = None,
    search: str | None = None,
    exploited: bool | None = None,
    publicly_disclosed: bool | None = None,
    card_filter: str | None = None,
) -> Any:
    query = db.query(MsrcVulnerability)
    if severity:
        query = query.filter(MsrcVulnerability.severity.ilike(f"%{severity}%"))
    if card_filter:
        normalized = card_filter.lower().strip()
        severity_text = func.lower(func.coalesce(MsrcVulnerability.severity, MsrcVulnerability.max_severity, ""))
        if normalized == "critical":
            query = query.filter(severity_text.like("%critical%"))
        elif normalized == "high_important":
            query = query.filter(or_(severity_text.like("%high%"), severity_text.like("%important%")))
        elif normalized == "moderate":
            query = query.filter(or_(severity_text.like("%medium%"), severity_text.like("%moderate%")))
        elif normalized == "low":
            query = query.filter(severity_text.like("%low%"))
        elif normalized == "exploited":
            query = query.filter(MsrcVulnerability.exploited == 1)
        elif normalized == "publicly_disclosed":
            query = query.filter(MsrcVulnerability.publicly_disclosed == 1)
        elif normalized == "kb_count":
            query = query.filter(MsrcVulnerability.kb_article.isnot(None), MsrcVulnerability.kb_article != "")
    if cve:
        query = query.filter(MsrcVulnerability.cve_id.ilike(f"%{cve}%"))
    if product:
        query = query.filter(MsrcVulnerability.product.ilike(f"%{product}%"))
    if kb:
        query = query.filter(MsrcVulnerability.kb_article.ilike(f"%{kb}%"))
    if month:
        query = query.filter(MsrcVulnerability.release_month == month)
    if exploited is not None:
        query = query.filter(MsrcVulnerability.exploited == int(exploited))
    if publicly_disclosed is not None:
        query = query.filter(MsrcVulnerability.publicly_disclosed == int(publicly_disclosed))
    if search:
        like = f"%{search}%"
        query = query.filter(or_(MsrcVulnerability.cve_id.ilike(like), MsrcVulnerability.title.ilike(like), MsrcVulnerability.product.ilike(like), MsrcVulnerability.kb_article.ilike(like), MsrcVulnerability.impact.ilike(like)))
    return query


def msrc_summary_payload(rows: list[MsrcVulnerability]) -> dict[str, Any]:
    cves = {row.cve_id for row in rows if row.cve_id}
    def sev_count(*names: str) -> int:
        lowered = tuple(name.lower() for name in names)
        return len({row.cve_id for row in rows if any(name in (row.severity or row.max_severity or "").lower() for name in lowered)})
    return {
        "total_records": len(rows),
        "total_cve": len(cves),
        "critical": sev_count("critical", "kritik"),
        "high_important": sev_count("important", "high", "yüksek"),
        "moderate": sev_count("moderate", "medium", "orta"),
        "low": sev_count("low", "düşük"),
        "exploited": len({row.cve_id for row in rows if row.exploited}),
        "publicly_disclosed": len({row.cve_id for row in rows if row.publicly_disclosed}),
        "kb_count": len({row.kb_article for row in rows if row.kb_article}),
    }


@api.get("/msrc/months")
def list_msrc_months() -> dict[str, Any]:
    return {"items": msrc_months(), "default": msrc_months(1)[0]}


@api.get("/msrc/sync")
def sync_msrc(month: str = Query(..., description="Örnek: 2026-May"), db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    try:
        raw = fetch_msrc_cvrf(month)
        logger.info("MSRC sync response status code: %s", raw.get("status_code"))
        logger.info("MSRC sync XML length: %s", len(raw.get("body") or ""))
        parsed = parse_msrc_cvrf(raw)
        parsed["month"] = month
        items = normalize_msrc_items(parsed)
    except MsrcApiError as exc:
        logger.exception("MSRC sync hata özeti: %s", exc)
        return {"ok": False, "message": "MSRC verisi çekildi ancak işlenemedi.", "detail": str(exc)}
    except Exception as exc:
        logger.exception("MSRC sync beklenmeyen hata: %s", exc)
        return {"ok": False, "message": "MSRC verisi çekildi ancak işlenemedi.", "detail": f"{type(exc).__name__}: {exc}"}

    logger.info("parse edilen vulnerability count: %s", len(items))
    if not items:
        add_system_log(db, "msrc_sync_empty", "MSRC verisi boş döndü", {"month": month}, current_actor)
        db.commit()
        return {"ok": True, "status": "empty", "message": "MSRC API bu ay için kayıt döndürmedi.", "inserted": 0, "updated": 0, "created": 0, "total": 0}

    inserted = 0
    updated = 0
    seen: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for item in items:
        cve_id = (item.get("cve_id") or "").strip()
        if not cve_id:
            continue
        release_month = (item.get("release_month") or month or "").strip()
        product = (item.get("product") or "").strip()
        kb_article = (item.get("kb_article") or "").strip()
        key = (cve_id, product, kb_article, release_month)
        item["cve_id"] = cve_id
        item["product"] = product
        item["kb_article"] = kb_article
        item["release_month"] = release_month
        seen[key] = item

    try:
        for (cve_id, product, kb_article, release_month), item in seen.items():
            existing = db.query(MsrcVulnerability).filter(
                MsrcVulnerability.cve_id == cve_id,
                MsrcVulnerability.product == product,
                MsrcVulnerability.kb_article == kb_article,
                MsrcVulnerability.release_month == release_month,
            ).first()
            payload = {key: (item.get(key) or "") for key in ["cve_id", "title", "severity", "product", "kb_article", "fixed_build", "impact", "max_severity", "release_month", "url", "raw_json"]}
            payload["title"] = payload["title"] or cve_id
            payload["severity"] = payload["severity"] or payload["max_severity"] or "-"
            payload["release_date"] = item.get("release_date")
            payload["publicly_disclosed"] = int(bool(item.get("publicly_disclosed")))
            payload["exploited"] = int(bool(item.get("exploited")))
            if existing:
                for field, value in payload.items():
                    setattr(existing, field, value)
                updated += 1
            else:
                db.add(MsrcVulnerability(**payload))
                inserted += 1
        add_system_log(db, "msrc_sync", "MSRC CVRF verisi senkronize edildi", {"month": month, "inserted": inserted, "updated": updated}, current_actor)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("MSRC DB kayıt hatası: %s", exc)
        return {"ok": False, "message": "MSRC verisi çekildi ancak işlenemedi.", "detail": f"DB kayıt hatası: {exc.__class__.__name__}: {exc}"}
    except Exception as exc:
        db.rollback()
        logger.exception("MSRC DB beklenmeyen hata: %s", exc)
        return {"ok": False, "message": "MSRC verisi çekildi ancak işlenemedi.", "detail": f"{type(exc).__name__}: {exc}"}

    logger.info("DB inserted/updated count: %s/%s", inserted, updated)
    return {"ok": True, "status": "success", "message": "MSRC verisi başarıyla senkronize edildi.", "inserted": inserted, "updated": updated, "created": inserted, "total": inserted + updated}


@api.get("/msrc/vulnerabilities")
def list_msrc_vulnerabilities(
    severity: str | None = None,
    cve: str | None = None,
    product: str | None = None,
    kb: str | None = None,
    month: str | None = None,
    search: str | None = None,
    exploited: bool | None = None,
    publicly_disclosed: bool | None = None,
    card_filter: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = msrc_filtered_query(db, severity, cve, product, kb, month, search, exploited, publicly_disclosed, card_filter).order_by(MsrcVulnerability.release_date.desc().nullslast(), MsrcVulnerability.cve_id.asc()).all()
    return {"items": [serialize_msrc(row) for row in rows], "total": len(rows)}


@api.get("/msrc/summary")
def msrc_summary(
    severity: str | None = None,
    cve: str | None = None,
    product: str | None = None,
    kb: str | None = None,
    month: str | None = None,
    search: str | None = None,
    exploited: bool | None = None,
    publicly_disclosed: bool | None = None,
    card_filter: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = msrc_filtered_query(db, severity, cve, product, kb, month, search, exploited, publicly_disclosed, card_filter).all()
    return msrc_summary_payload(rows)


@api.post("/msrc/vulnerabilities/{msrc_id}/convert-to-finding")
def convert_msrc_vulnerability(msrc_id: int, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    row = db.query(MsrcVulnerability).filter(MsrcVulnerability.id == msrc_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="MSRC CVE kaydı bulunamadı")
    duplicate = db.query(Finding).filter(Finding.source == "MSRC", Finding.note.ilike(f"%CVE: {row.cve_id}%")).one_or_none()
    if duplicate:
        return {"status": "duplicate", "message": "Bu CVE daha önce bulguya dönüştürülmüş.", "finding": as_out(duplicate)}
    severity = map_defender_severity(row.severity or row.max_severity)
    product_name = (row.product or "").strip()
    title = f"{row.cve_id} - {product_name} Zafiyeti" if product_name else f"{row.cve_id} - Microsoft Güvenlik Zafiyeti"
    description_lines = [
        f"CVE: {row.cve_id}",
        f"Etkilenen Ürün / Uygulama: {product_name or '-'}",
        f"Seviye: {row.severity or row.max_severity or '-'}",
        f"Etki: {row.impact or row.title or '-'}",
    ]
    if row.kb_article:
        description_lines.append(f"KB: {row.kb_article}")
    description = "\n".join(description_lines)
    recommendation = f"İlgili Microsoft güncellemesini uygulayın. KB: {row.kb_article or '-'}; Fixed Build: {row.fixed_build or '-'}; URL: {row.url or '-'}"
    base = f"MSRC-{row.cve_id}"
    record_no = base
    suffix = 1
    while db.query(Finding).filter(Finding.record_no == record_no).one_or_none():
        suffix += 1
        record_no = f"{base}-{suffix}"
    finding = Finding(record_no=record_no, title=title[:512], severity=severity, impact=row.impact or "", description=description, recommendation=recommendation, related_unit="Sistem", related_person="", status=STATUS_OPEN, due_date=due_for_severity(severity), note=f"MSRC kaynak bilgisi\nCVE: {row.cve_id}\nÜrün: {row.product}\nKB: {row.kb_article}\nMSRC ID: {row.id}", source="MSRC")
    db.add(finding); db.flush()
    add_finding_action(db, finding, "created_from_msrc", current_actor, note="MSRC CVE kaydından bulgu oluşturuldu")
    add_system_log(db, "msrc_convert", "MSRC CVE bulguya dönüştürüldü", {"cve_id": row.cve_id, "record_no": record_no}, current_actor)
    db.commit(); db.refresh(finding)
    return {"status": "created", "message": "MSRC CVE bulguya dönüştürüldü.", "finding": as_out(finding)}


@api.get("/msrc/export/excel")
def export_msrc_excel(
    severity: str | None = None,
    cve: str | None = None,
    product: str | None = None,
    kb: str | None = None,
    month: str | None = None,
    search: str | None = None,
    exploited: bool | None = None,
    publicly_disclosed: bool | None = None,
    card_filter: str | None = None,
    db: Session = Depends(get_db),
    current_actor: str = Depends(actor),
) -> StreamingResponse:
    rows = msrc_filtered_query(db, severity, cve, product, kb, month, search, exploited, publicly_disclosed, card_filter).order_by(MsrcVulnerability.cve_id.asc()).all()
    items = [serialize_msrc(row) for row in rows]
    content = build_msrc_export(msrc_summary_payload(rows), items)
    add_system_log(db, "msrc_export", "MSRC Excel listesi dışa aktarıldı", {"count": len(items), "month": month}, current_actor)
    db.commit()
    filename_month = month or datetime.now().strftime("%Y-%b")
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="msrc-cve-listesi-{filename_month}.xlsx"'})


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
