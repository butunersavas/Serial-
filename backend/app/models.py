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


class DefenderSettings(Base):
    __tablename__ = "defender_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[str] = mapped_column(String(255), default="")
    client_id: Mapped[str] = mapped_column(String(255), default="")
    client_secret_encrypted_or_masked: Mapped[str] = mapped_column(Text, default="")
    api_base_url: Mapped[str] = mapped_column(String(512), default="https://api.security.microsoft.com")
    integration_enabled: Mapped[int] = mapped_column(Integer, default=0)
    last_test_status: Mapped[str] = mapped_column(String(32), default="not_tested")
    last_test_message: Mapped[str] = mapped_column(Text, default="")
    last_test_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DefenderVulnerability(Base):
    __tablename__ = "defender_vulnerabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cve_id: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    name: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(32), default="", index=True)
    cvss_v3: Mapped[str] = mapped_column(String(32), default="")
    cvss_vector: Mapped[str] = mapped_column(String(255), default="")
    exposed_machines: Mapped[int] = mapped_column(Integer, default=0, index=True)
    published_on: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_on: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_detected: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    public_exploit: Mapped[int] = mapped_column(Integer, default=0, index=True)
    exploit_verified: Mapped[int] = mapped_column(Integer, default=0, index=True)
    exploit_in_kit: Mapped[int] = mapped_column(Integer, default=0)
    exploit_types: Mapped[str] = mapped_column(Text, default="")
    epss: Mapped[str] = mapped_column(String(32), default="")
    status: Mapped[str] = mapped_column(String(64), default="Active", index=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DefenderMachineVulnerability(Base):
    __tablename__ = "defender_machine_vulnerabilities"
    __table_args__ = (UniqueConstraint("cve_id", "machine_id", "product_name", "product_version", name="uq_def_machine_vuln"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cve_id: Mapped[str] = mapped_column(String(64), index=True)
    machine_id: Mapped[str] = mapped_column(String(255), index=True)
    machine_name: Mapped[str] = mapped_column(String(255), default="", index=True)
    product_vendor: Mapped[str] = mapped_column(String(255), default="", index=True)
    product_name: Mapped[str] = mapped_column(String(255), default="", index=True)
    product_version: Mapped[str] = mapped_column(String(128), default="")
    severity: Mapped[str] = mapped_column(String(32), default="", index=True)
    fixing_kb_id: Mapped[str] = mapped_column(String(128), default="")
    recommendation_id: Mapped[str] = mapped_column(String(255), default="", index=True)
    remediation_status: Mapped[str] = mapped_column(String(128), default="Open", index=True)
    first_seen: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DefenderRecommendation(Base):
    __tablename__ = "defender_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recommendation_id: Mapped[str] = mapped_column(String(255), index=True, unique=True)
    product_name: Mapped[str] = mapped_column(String(255), default="", index=True)
    vendor: Mapped[str] = mapped_column(String(255), default="", index=True)
    recommendation_name: Mapped[str] = mapped_column(String(512), default="")
    recommendation_category: Mapped[str] = mapped_column(String(255), default="")
    severity_score: Mapped[str] = mapped_column(String(32), default="")
    exposed_machines: Mapped[int] = mapped_column(Integer, default=0)
    remediation_type: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(64), default="Active", index=True)
    config_score_impact: Mapped[str] = mapped_column(String(32), default="")
    exposure_impact: Mapped[str] = mapped_column(String(32), default="")
    raw_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DefenderSyncLog(Base):
    __tablename__ = "defender_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sync_type: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    total_records: Mapped[int] = mapped_column(Integer, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    finished_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
