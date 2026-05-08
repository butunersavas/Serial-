from datetime import date, datetime
from io import BytesIO
import re
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from .models import Finding, SEVERITIES, STATUS_CLOSED, STATUS_OPEN

FINDING_COLUMNS = [
    ("record_no", "Kayıt No"),
    ("title", "Bulgu Başlığı"),
    ("severity", "Durum Seviyesi"),
    ("impact", "Bulgunun Etkisi"),
    ("description", "Bulgunun Açıklaması"),
    ("recommendation", "Çözüm Önerisi"),
    ("related_unit", "İlgili Birim / Kurum"),
    ("related_person", "İlgili Kişi"),
    ("status", "Durum"),
    ("due_date", "Termin Tarih"),
    ("new_due_date", "Yeni Termin"),
    ("note", "Not"),
    ("updated_at", "Son Güncelleme"),
]

HEADER_ALIASES = {
    "record_no": ["kayit no", "kayıt no", "kayit numarasi", "kayıt numarası", "no", "id"],
    "title": ["bulgu basligi", "bulgu başlığı", "baslik", "başlık", "bulgu"],
    "severity": ["durum seviyesi", "seviye", "risk seviyesi", "onem", "önem", "kritiklik"],
    "impact": ["bulgunun etkisi", "etki", "risk etkisi"],
    "description": ["bulgunun aciklamasi", "bulgunun açıklaması", "aciklama", "açıklama"],
    "recommendation": ["cozum onerisi", "çözüm önerisi", "onerisi", "öneri", "aksiyon"],
    "related_unit": ["ilgili birim / kurum", "ilgili birim", "ilgili kurum", "ilgili"],
    "related_person": ["ilgili kisi", "ilgili kişi", "sorumlu", "sorumlu kisi", "sorumlu kişi"],
    "status": ["durum", "kapanma durumu"],
    "due_date": ["termin tarih", "termin tarihi", "termin"],
    "new_due_date": ["yeni termin", "yeni termin tarih", "yeni termin tarihi"],
    "note": ["not", "notlar", "acik not", "açık not"],
}

GREEN_FILL = PatternFill("solid", fgColor="D9EAD3")
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)


def normalize_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    replacements = str.maketrans({"ı": "i", "İ": "i", "ğ": "g", "ü": "u", "ş": "s", "ö": "o", "ç": "c"})
    text = text.translate(replacements)
    text = re.sub(r"[^a-z0-9/ ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    return None


def normalize_status(value: Any) -> str:
    normalized = normalize_header(value)
    if normalized in {"kapatildi", "kapali", "closed", "tamamlandi"}:
        return STATUS_CLOSED
    return STATUS_OPEN


def normalize_severity(value: Any) -> str:
    normalized = normalize_header(value)
    for severity in SEVERITIES:
        if normalized == normalize_header(severity):
            return severity
    return "Orta"


def build_header_map(headers: list[Any]) -> dict[str, int]:
    normalized_headers = [normalize_header(header) for header in headers]
    header_map: dict[str, int] = {}
    for field, aliases in HEADER_ALIASES.items():
        normalized_aliases = {normalize_header(alias) for alias in aliases}
        for index, normalized in enumerate(normalized_headers):
            if normalized in normalized_aliases:
                header_map[field] = index
                break
    return header_map


def row_to_payload(row: tuple[Any, ...], header_map: dict[str, int], fallback_no: int) -> dict[str, Any]:
    payload: dict[str, Any] = {field: "" for field, _ in FINDING_COLUMNS if field != "updated_at"}
    payload["record_no"] = f"IMPORT-{fallback_no}"
    payload["severity"] = "Orta"
    payload["status"] = STATUS_OPEN
    payload["due_date"] = None
    payload["new_due_date"] = None

    for field, index in header_map.items():
        value = row[index] if index < len(row) else None
        if field in {"due_date", "new_due_date"}:
            payload[field] = parse_date(value)
        elif field == "status":
            payload[field] = normalize_status(value)
        elif field == "severity":
            payload[field] = normalize_severity(value)
        else:
            payload[field] = str(value or "").strip()

    return payload


def import_findings(db: Session, contents: bytes) -> tuple[int, int]:
    workbook = load_workbook(BytesIO(contents), data_only=True)
    sheet = workbook["Bulgular"] if "Bulgular" in workbook.sheetnames else workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return 0, 0

    header_map = build_header_map(list(rows[0]))
    created = 0
    updated = 0
    for row_number, row in enumerate(rows[1:], start=2):
        if not any(cell not in (None, "") for cell in row):
            continue
        payload = row_to_payload(row, header_map, row_number)
        if not payload["record_no"]:
            payload["record_no"] = f"IMPORT-{row_number}"
        finding = db.query(Finding).filter(Finding.record_no == payload["record_no"]).one_or_none()
        if finding:
            for key, value in payload.items():
                setattr(finding, key, value)
            updated += 1
        else:
            db.add(Finding(**payload))
            created += 1
    db.commit()
    return created, updated


def build_export(findings: list[Finding], summary: dict[str, Any]) -> bytes:
    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = "Ozet"
    findings_sheet = workbook.create_sheet("Bulgular")

    summary_sheet.append(["Alan", "Değer"])
    summary_sheet.append(["Toplam Bulgu", summary["total"]])
    summary_sheet.append(["Kapatılan", summary["closed"]])
    summary_sheet.append(["Açık Kalan", summary["open"]])
    summary_sheet.append(["Kapanma Oranı", f"%{summary['closure_rate']:.2f}"])
    summary_sheet.append(["Son Çalışma Saati", summary["last_work_time"] or ""])
    summary_sheet.append([])
    summary_sheet.append(["Durum Seviyesi", "Toplam", "Kapatılan", "Açık Kalan"])
    for row in summary["severity_rows"]:
        summary_sheet.append([row["severity"], row["total"], row["closed"], row["open"]])

    findings_sheet.append([header for _, header in FINDING_COLUMNS])
    for cell in findings_sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    for finding in findings:
        findings_sheet.append([getattr(finding, field) or "" for field, _ in FINDING_COLUMNS])
        excel_row = findings_sheet.max_row
        if finding.status == STATUS_CLOSED:
            for col_idx in [1, *range(3, 12)]:
                findings_sheet.cell(row=excel_row, column=col_idx).fill = GREEN_FILL

    validation = DataValidation(type="list", formula1='"Devam Ediyor,Kapatıldı"', allow_blank=False)
    findings_sheet.add_data_validation(validation)
    if findings:
        validation.add(f"I2:I{findings_sheet.max_row}")

    for sheet in (summary_sheet, findings_sheet):
        for column_cells in sheet.columns:
            max_length = max(len(str(cell.value or "")) for cell in column_cells)
            sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 60)

    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()
