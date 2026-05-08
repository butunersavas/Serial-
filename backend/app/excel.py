from __future__ import annotations

import re
from datetime import date, datetime
from io import BytesIO
from typing import Any

try:
    import xlsxwriter
except ModuleNotFoundError:  # pragma: no cover - fallback keeps local dev working without network
    xlsxwriter = None
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.styles import Font, PatternFill
from openpyxl import load_workbook
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
    "record_no": ["kayıt no", "kayit no", "no", "id"],
    "title": ["bulgu başlığı", "bulgu basligi", "başlık", "baslik"],
    "severity": ["durum seviyesi", "seviye", "risk", "öncelik", "oncelik"],
    "impact": ["bulgunun etkisi", "etki"],
    "description": ["bulgunun açıklaması", "bulgunun aciklamasi", "açıklama", "aciklama"],
    "recommendation": ["çözüm önerisi", "cozum onerisi", "öneri", "oneri"],
    "related_unit": ["ilgili birim / kurum", "ilgili birim", "ilgili kurum", "ilgili"],
    "related_person": ["ilgili kişi", "ilgili kisi", "sorumlu", "sorumlu kisi"],
    "status": ["durum", "kapanma durumu"],
    "due_date": ["termin tarih", "termin tarihi", "termin"],
    "new_due_date": ["yeni termin", "yeni termin tarih", "yeni termin tarihi"],
    "note": ["not", "notlar", "açık not", "acik not"],
}


def normalize_header(value: Any) -> str:
    text = str(value or "").strip().lower().replace("i̇", "i")
    text = text.translate(str.maketrans({"ı": "i", "İ": "i", "ğ": "g", "ü": "u", "ş": "s", "ö": "o", "ç": "c"}))
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
        alias_set = {normalize_header(alias) for alias in aliases}
        for index, normalized in enumerate(normalized_headers):
            if normalized in alias_set:
                header_map[field] = index
                break
    return header_map


def row_to_payload(row: tuple[Any, ...], header_map: dict[str, int], fallback_no: int, source: str) -> dict[str, Any]:
    payload: dict[str, Any] = {field: "" for field, _ in FINDING_COLUMNS if field != "updated_at"}
    payload.update({"record_no": f"IMPORT-{fallback_no}", "severity": "Orta", "status": STATUS_OPEN, "due_date": None, "new_due_date": None, "source": source})
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


def read_excel(contents: bytes, filename: str = "Excel") -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    workbook = load_workbook(BytesIO(contents), data_only=True)
    if "Bulgular" not in workbook.sheetnames:
        raise ValueError('Excel içinde "Bulgular" sayfası bulunamadı')
    sheet = workbook["Bulgular"]
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return [], []
    header_map = build_header_map(list(rows[0]))
    errors: list[dict[str, Any]] = []
    payloads: list[dict[str, Any]] = []
    if "record_no" not in header_map:
        errors.append({"row": 1, "message": "Kayıt No kolonu bulunamadı"})
    for row_number, row in enumerate(rows[1:], start=2):
        if not any(cell not in (None, "") for cell in row):
            continue
        payload = row_to_payload(row, header_map, row_number, filename)
        if not payload["record_no"]:
            errors.append({"row": row_number, "message": "Kayıt No boş olamaz"})
            continue
        payloads.append(payload)
    return payloads, errors


def import_findings(db: Session, contents: bytes, filename: str) -> dict[str, Any]:
    payloads, errors = read_excel(contents, filename)
    created = 0
    updated = 0
    for payload in payloads:
        finding = db.query(Finding).filter(Finding.record_no == payload["record_no"]).one_or_none()
        if finding:
            for key, value in payload.items():
                setattr(finding, key, value)
            updated += 1
        else:
            db.add(Finding(**payload))
            created += 1
    db.commit()
    return {"message": "İçe aktarma tamamlandı", "created": created, "updated": updated, "failed": len(errors), "errors": errors}


def preview_findings(contents: bytes, filename: str) -> dict[str, Any]:
    payloads, errors = read_excel(contents, filename)
    return {"preview": payloads[:50], "total": len(payloads), "failed": len(errors), "errors": errors}


def excel_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value or ""


def build_export(findings: list[Finding], summary: dict[str, Any]) -> bytes:
    if xlsxwriter is None:
        return build_export_openpyxl(findings, summary)
    output = BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    summary_sheet = workbook.add_worksheet("Ozet")
    findings_sheet = workbook.add_worksheet("Bulgular")

    title_fmt = workbook.add_format({"bold": True, "font_size": 14, "font_color": "#0f2f57"})
    header_fmt = workbook.add_format({"bold": True, "bg_color": "#1F4E78", "font_color": "#FFFFFF", "border": 1})
    green_fmt = workbook.add_format({"bg_color": "#D9EAD3"})
    percent_fmt = workbook.add_format({"num_format": "0.00%"})

    summary_sheet.write(0, 0, "Sürat Kargo Sızma - Güvenlik Testi Bulgu Özeti", title_fmt)
    summary_sheet.write(2, 0, "Durum Seviyesi", header_fmt)
    summary_sheet.write(2, 1, "Toplam", header_fmt)
    summary_sheet.write(2, 2, "Kapatılan", header_fmt)
    summary_sheet.write(2, 3, "Açık Kalan", header_fmt)
    for row_idx, row in enumerate(summary["severity_rows"], start=3):
        summary_sheet.write(row_idx, 0, row["severity"])
        summary_sheet.write_number(row_idx, 1, row["total"])
        summary_sheet.write_number(row_idx, 2, row["closed"])
        summary_sheet.write_number(row_idx, 3, row["open"])
    footer = 4 + len(summary["severity_rows"])
    summary_sheet.write(footer, 0, "Kapanma Oranı")
    summary_sheet.write_number(footer, 1, (summary.get("closure_rate") or 0) / 100, percent_fmt)
    summary_sheet.write(footer + 1, 0, "Son Çalışma Saati")
    summary_sheet.write(footer + 1, 1, str(summary.get("last_work_time") or ""))
    summary_sheet.set_column("A:D", 24)

    for col, (_, header) in enumerate(FINDING_COLUMNS):
        findings_sheet.write(0, col, header, header_fmt)
    for row_idx, finding in enumerate(findings, start=1):
        is_closed = finding.status == STATUS_CLOSED
        for col, (field, _) in enumerate(FINDING_COLUMNS):
            fmt = green_fmt if is_closed and (col == 0 or 2 <= col <= 10) else None
            findings_sheet.write(row_idx, col, excel_value(getattr(finding, field)), fmt)
    last_row = max(len(findings) + 1, 2)
    findings_sheet.data_validation(1, 8, last_row, 8, {"validate": "list", "source": [STATUS_OPEN, STATUS_CLOSED]})
    for idx, width in enumerate([16, 34, 16, 28, 42, 32, 28, 22, 16, 16, 16, 28, 22]):
        findings_sheet.set_column(idx, idx, width)
    findings_sheet.freeze_panes(1, 0)
    workbook.close()
    output.seek(0)
    return output.read()


def build_export_openpyxl(findings: list[Finding], summary: dict[str, Any]) -> bytes:
    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = "Ozet"
    findings_sheet = workbook.create_sheet("Bulgular")
    green_fill = PatternFill("solid", fgColor="D9EAD3")
    header_fill = PatternFill("solid", fgColor="1F4E78")
    header_font = Font(color="FFFFFF", bold=True)
    summary_sheet.append(["Sürat Kargo Sızma - Güvenlik Testi Bulgu Özeti"])
    summary_sheet.append([])
    summary_sheet.append(["Durum Seviyesi", "Toplam", "Kapatılan", "Açık Kalan"])
    for cell in summary_sheet[3]:
        cell.fill = header_fill
        cell.font = header_font
    for row in summary["severity_rows"]:
        summary_sheet.append([row["severity"], row["total"], row["closed"], row["open"]])
    summary_sheet.append([])
    summary_sheet.append(["Kapanma Oranı", f"%{summary.get('closure_rate') or 0:.2f}"])
    summary_sheet.append(["Son Çalışma Saati", str(summary.get("last_work_time") or "")])
    findings_sheet.append([header for _, header in FINDING_COLUMNS])
    for cell in findings_sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
    for finding in findings:
        findings_sheet.append([excel_value(getattr(finding, field)) for field, _ in FINDING_COLUMNS])
        if finding.status == STATUS_CLOSED:
            for col_idx in [1, *range(3, 12)]:
                findings_sheet.cell(row=findings_sheet.max_row, column=col_idx).fill = green_fill
    validation = DataValidation(type="list", formula1='"Devam Ediyor,Kapatıldı"', allow_blank=False)
    findings_sheet.add_data_validation(validation)
    validation.add(f"I2:I{max(findings_sheet.max_row, 2)}")
    for sheet in (summary_sheet, findings_sheet):
        for column_cells in sheet.columns:
            max_length = max(len(str(cell.value or "")) for cell in column_cells)
            sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 60)
    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()
