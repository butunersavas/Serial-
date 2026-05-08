from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    source: Mapped[str] = mapped_column(String(255), default="Manuel")
    closed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    closed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to: Mapped[str] = mapped_column(String(512), default="", index=True)
    last_action_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_action_note: Mapped[str] = mapped_column(Text, default="")
    delay_days: Mapped[int] = mapped_column(Integer, default=0)
    sla_status: Mapped[str] = mapped_column(String(32), default="Zamanında", index=True)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    actions: Mapped[list["FindingAction"]] = relationship("FindingAction", back_populates="finding", cascade="all, delete-orphan")


class FindingAction(Base):
    __tablename__ = "finding_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), index=True)
    action_type: Mapped[str] = mapped_column(String(64), index=True)
    old_value: Mapped[str] = mapped_column(Text, default="")
    new_value: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="admin", index=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    finding: Mapped[Finding] = relationship("Finding", back_populates="actions")


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(String(512), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="system", index=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor: Mapped[str] = mapped_column(String(255), default="admin", index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    finding_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    record_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
