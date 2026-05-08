from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .excel import build_export, import_findings, preview_findings
from .models import AuditLog, Finding, SEVERITIES, STATUS_CLOSED, STATUS_OPEN, STATUSES
from .schemas import AuditLogOut, DashboardSummary, FindingCreate, FindingOut, FindingUpdate

Base.metadata.create_all(bind=engine)

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
    return x_user or "web-kullanici"


def log_action(db: Session, action: str, current_actor: str, detail: str = "", finding: Finding | None = None) -> None:
    db.add(
        AuditLog(
            actor=current_actor,
            action=action,
            finding_id=finding.id if finding else None,
            record_no=finding.record_no if finding else None,
            detail=detail,
        )
    )


def validate_choice(value: str, allowed: list[str], field_name: str) -> None:
    if value not in allowed:
        raise HTTPException(status_code=422, detail=f"{field_name} geçersiz: {value}")


def due_column() -> Any:
    return func.coalesce(Finding.new_due_date, Finding.due_date)


def query_open(db: Session) -> Any:
    return db.query(Finding).filter(Finding.status != STATUS_CLOSED)


def group_count(rows: list[tuple[str | None, int]], fallback: str = "Belirtilmedi") -> list[dict[str, Any]]:
    return [{"name": name or fallback, "count": count} for name, count in rows]


def dashboard_data(db: Session) -> dict[str, Any]:
    today = date.today()
    total = db.query(Finding).count()
    closed = db.query(Finding).filter(Finding.status == STATUS_CLOSED).count()
    open_count = total - closed
    delayed = query_open(db).filter(due_column() < today).count()
    last_work_time = db.query(func.max(AuditLog.created_at)).scalar() or db.query(func.max(Finding.updated_at)).scalar()

    rows: list[dict[str, int | str]] = []
    severity_counts: dict[str, int] = {}
    for severity in SEVERITIES:
        severity_total = db.query(Finding).filter(Finding.severity == severity).count()
        severity_closed = db.query(Finding).filter(Finding.severity == severity, Finding.status == STATUS_CLOSED).count()
        severity_counts[severity] = severity_total
        rows.append({"severity": severity, "total": severity_total, "closed": severity_closed, "open": severity_total - severity_closed})
    rows.append({"severity": "Toplam", "total": total, "closed": closed, "open": open_count})

    open_by_unit = group_count(
        query_open(db).with_entities(Finding.related_unit, func.count(Finding.id)).group_by(Finding.related_unit).order_by(func.count(Finding.id).desc()).limit(10).all(),
        "Birim belirtilmedi",
    )
    open_by_person = group_count(
        query_open(db).with_entities(Finding.related_person, func.count(Finding.id)).group_by(Finding.related_person).order_by(func.count(Finding.id).desc()).limit(10).all(),
        "Kişi belirtilmedi",
    )
    approaching = (
        query_open(db)
        .filter(due_column() >= today, due_column() <= today + timedelta(days=14))
        .order_by(due_column().asc())
        .limit(10)
        .all()
    )
    priority_order = {"Acil": 0, "Kritik": 1, "Yüksek": 2, "Orta": 3, "Düşük": 4}
    critical_open = sorted(query_open(db).all(), key=lambda item: (priority_order.get(item.severity, 9), item.due_date or date.max))[:10]

    return {
        "total": total,
        "closed": closed,
        "open": open_count,
        "delayed": delayed,
        "closure_rate": round((closed / total * 100), 2) if total else 0,
        "last_work_time": last_work_time,
        "severity_rows": rows,
        "severity_counts": severity_counts,
        "status_distribution": [{"name": STATUS_OPEN, "count": open_count}, {"name": STATUS_CLOSED, "count": closed}],
        "open_by_unit": open_by_unit,
        "open_by_person": open_by_person,
        "approaching_due": [FindingOut.model_validate(item).model_dump(mode="json") for item in approaching],
        "critical_open": [FindingOut.model_validate(item).model_dump(mode="json") for item in critical_open],
        "demo": total == 0,
    }


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bulgu-takip-api"}


@api.get("/metadata")
def metadata() -> dict[str, list[str]]:
    return {"statuses": STATUSES, "severities": SEVERITIES}


@api.get("/findings", response_model=list[FindingOut])
def list_findings(
    db: Session = Depends(get_db),
    severity: str | None = None,
    status: str | None = None,
    related_unit: str | None = None,
    related_person: str | None = None,
    search: str | None = None,
    approaching_due: bool = False,
    overdue: bool = False,
    open_only: bool = False,
    closed_only: bool = False,
) -> list[Finding]:
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
    if approaching_due:
        today = date.today()
        query = query.filter(Finding.status != STATUS_CLOSED, due_column().between(today, today + timedelta(days=14)))
    if overdue:
        query = query.filter(Finding.status != STATUS_CLOSED, due_column() < date.today())
    if open_only:
        query = query.filter(Finding.status != STATUS_CLOSED)
    if closed_only:
        query = query.filter(Finding.status == STATUS_CLOSED)
    return query.order_by(Finding.updated_at.desc()).all()


@api.post("/findings", response_model=FindingOut)
def create_finding(payload: FindingCreate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> Finding:
    validate_choice(payload.severity, SEVERITIES, "Durum seviyesi")
    validate_choice(payload.status, STATUSES, "Durum")
    if db.query(Finding).filter(Finding.record_no == payload.record_no).one_or_none():
        raise HTTPException(status_code=409, detail="Bu kayıt no zaten var")
    finding = Finding(**payload.model_dump())
    db.add(finding)
    db.flush()
    log_action(db, "create", current_actor, "Bulgu oluşturuldu", finding)
    db.commit()
    db.refresh(finding)
    return finding


@api.put("/findings/{finding_id}", response_model=FindingOut)
@api.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(finding_id: int, payload: FindingUpdate, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> Finding:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    data = payload.model_dump(exclude_unset=True)
    if "severity" in data and data["severity"] is not None:
        validate_choice(data["severity"], SEVERITIES, "Durum seviyesi")
    if "status" in data and data["status"] is not None:
        validate_choice(data["status"], STATUSES, "Durum")
    old_status = finding.status
    for key, value in data.items():
        setattr(finding, key, value)
    finding.updated_at = datetime.now(timezone.utc)
    log_action(db, "close" if data.get("status") == STATUS_CLOSED and old_status != STATUS_CLOSED else "update", current_actor, "Bulgu güncellendi", finding)
    db.commit()
    db.refresh(finding)
    return finding


@api.delete("/findings/{finding_id}")
def delete_finding(finding_id: int, db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, str]:
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Bulgu bulunamadı")
    log_action(db, "delete", current_actor, "Bulgu silindi", finding)
    db.delete(finding)
    db.commit()
    return {"message": "Bulgu silindi"}


@api.post("/import/excel")
async def import_excel(file: UploadFile = File(...), preview: bool = Query(default=False), db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Sadece .xlsx veya .xlsm dosyası yükleyin")
    contents = await file.read()
    try:
        if preview:
            return preview_findings(contents, file.filename)
        result = import_findings(db, contents, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Excel içe aktarma başarısız: {exc}") from exc
    log_action(db, "import", current_actor, f"{file.filename}: {result['created']} yeni, {result['updated']} güncellendi")
    db.commit()
    return result


@api.get("/export/excel")
def export_excel(db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> StreamingResponse:
    findings = db.query(Finding).order_by(Finding.record_no.asc()).all()
    content = build_export(findings, dashboard_data(db))
    log_action(db, "export", current_actor, "Excel raporu dışa aktarıldı")
    db.commit()
    filename = f"guvenlik-bulgu-raporu-{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(BytesIO(content), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    return dashboard_data(db)


@api.get("/logs", response_model=list[AuditLogOut])
def logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()


# Backward-compatible routes for the phase-0 frontend while the canonical API lives under /api.
legacy.add_api_route("/health", health, methods=["GET"])
legacy.add_api_route("/metadata", metadata, methods=["GET"])
legacy.add_api_route("/findings", list_findings, methods=["GET"], response_model=list[FindingOut])
legacy.add_api_route("/findings", create_finding, methods=["POST"], response_model=FindingOut)
legacy.add_api_route("/findings/{finding_id}", update_finding, methods=["PATCH", "PUT"], response_model=FindingOut)
legacy.add_api_route("/findings/{finding_id}", delete_finding, methods=["DELETE"])
legacy.add_api_route("/import", import_excel, methods=["POST"])
legacy.add_api_route("/export", export_excel, methods=["GET"])
legacy.add_api_route("/dashboard", dashboard, methods=["GET"])
legacy.add_api_route("/logs", logs, methods=["GET"], response_model=list[AuditLogOut])

app.include_router(api)
app.include_router(legacy)
