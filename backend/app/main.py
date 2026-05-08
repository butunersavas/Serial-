from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .excel import build_export, import_findings
from .models import AuditLog, Finding, SEVERITIES, STATUS_CLOSED, STATUS_OPEN, STATUSES
from .schemas import AuditLogOut, DashboardSummary, FindingCreate, FindingOut, FindingUpdate

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kurumsal Güvenlik Bulgu Takip API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def actor(x_user: str | None = Header(default=None)) -> str:
    return x_user or "admin"


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


def dashboard_data(db: Session) -> dict:
    total = db.query(Finding).count()
    closed = db.query(Finding).filter(Finding.status == STATUS_CLOSED).count()
    open_count = total - closed
    last_work_time = db.query(func.max(AuditLog.created_at)).scalar()
    rows: list[dict[str, int | str]] = []
    for severity in SEVERITIES:
        severity_total = db.query(Finding).filter(Finding.severity == severity).count()
        severity_closed = db.query(Finding).filter(Finding.severity == severity, Finding.status == STATUS_CLOSED).count()
        rows.append(
            {
                "severity": severity,
                "total": severity_total,
                "closed": severity_closed,
                "open": severity_total - severity_closed,
            }
        )
    rows.append({"severity": "Toplam", "total": total, "closed": closed, "open": open_count})
    return {
        "total": total,
        "closed": closed,
        "open": open_count,
        "closure_rate": round((closed / total * 100), 2) if total else 0,
        "last_work_time": last_work_time,
        "severity_rows": rows,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metadata")
def metadata() -> dict[str, list[str]]:
    return {"statuses": STATUSES, "severities": SEVERITIES}


@app.get("/findings", response_model=list[FindingOut])
def list_findings(
    db: Session = Depends(get_db),
    severity: str | None = None,
    status: str | None = None,
    related_unit: str | None = None,
    related_person: str | None = None,
    approaching_due: bool = False,
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
    if approaching_due:
        today = date.today()
        soon = today + timedelta(days=7)
        query = query.filter(
            Finding.status != STATUS_CLOSED,
            or_(Finding.due_date.between(today, soon), Finding.new_due_date.between(today, soon)),
        )
    if open_only:
        query = query.filter(Finding.status != STATUS_CLOSED)
    if closed_only:
        query = query.filter(Finding.status == STATUS_CLOSED)
    return query.order_by(Finding.updated_at.desc()).all()


@app.post("/findings", response_model=FindingOut)
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


@app.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: int,
    payload: FindingUpdate,
    db: Session = Depends(get_db),
    current_actor: str = Depends(actor),
) -> Finding:
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
    if data.get("status") == STATUS_CLOSED and old_status != STATUS_CLOSED:
        log_action(db, "close", current_actor, "Bulgu kapatıldı", finding)
    else:
        log_action(db, "update", current_actor, "Bulgu güncellendi", finding)
    db.commit()
    db.refresh(finding)
    return finding


@app.post("/import")
async def import_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_actor: str = Depends(actor),
) -> dict[str, int | str]:
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Sadece .xlsx veya .xlsm dosyası yükleyin")
    contents = await file.read()
    created, updated = import_findings(db, contents)
    log_action(db, "import", current_actor, f"{file.filename}: {created} yeni, {updated} güncellendi")
    db.commit()
    return {"message": "İçe aktarma tamamlandı", "created": created, "updated": updated}


@app.get("/export")
def export_excel(db: Session = Depends(get_db), current_actor: str = Depends(actor)) -> StreamingResponse:
    findings = db.query(Finding).order_by(Finding.record_no.asc()).all()
    content = build_export(findings, dashboard_data(db))
    log_action(db, "export", current_actor, "Excel raporu dışa aktarıldı")
    db.commit()
    filename = f"guvenlik-bulgu-raporu-{datetime.now().strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/dashboard", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db)) -> dict:
    return dashboard_data(db)


@app.get("/logs", response_model=list[AuditLogOut])
def logs(db: Session = Depends(get_db), limit: int = Query(default=100, le=500)) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
