from sqlalchemy import Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

STATUS_OPEN = "Devam Ediyor"
STATUS_CLOSED = "Kapatıldı"
STATUSES = [STATUS_OPEN, STATUS_CLOSED]
SEVERITIES = ["Acil", "Kritik", "Yüksek", "Orta", "Düşük"]


class Finding(Base):
    __tablename__ = "findings"
    __table_args__ = (UniqueConstraint("record_no", name="uq_findings_record_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_no: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(512), default="")
    severity: Mapped[str] = mapped_column(String(32), default="Orta", index=True)
    impact: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    recommendation: Mapped[str] = mapped_column(Text, default="")
    related_unit: Mapped[str] = mapped_column(String(512), default="", index=True)
    related_person: Mapped[str] = mapped_column(String(512), default="", index=True)
    status: Mapped[str] = mapped_column(String(32), default=STATUS_OPEN, index=True)
    due_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    new_due_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor: Mapped[str] = mapped_column(String(255), default="admin", index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    finding_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    record_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
