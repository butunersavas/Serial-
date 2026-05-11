from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Any

MSRC_CVRF_BASE_URL = "https://api.msrc.microsoft.com/cvrf/v3.0/cvrf"
logger = logging.getLogger(__name__)
MONTH_PATTERN = re.compile(r"^\d{4}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$")


class MsrcApiError(RuntimeError):
    """Controlled exception for MSRC CVRF integration errors."""


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def first_text(value: Any, *keys: str) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in keys:
            if key in value:
                found = first_text(value.get(key), *keys)
                if found:
                    return found
        for key in ("Value", "value", "Description", "description", "_text", "text"):
            if key in value:
                found = first_text(value.get(key), *keys)
                if found:
                    return found
    return ""


def parse_bool(value: Any) -> bool:
    text = first_text(value).lower()
    return text in {"true", "yes", "1", "exploited", "detected", "public", "known exploited"}


def parse_date(value: Any) -> date | None:
    text = first_text(value)
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    for parser in (datetime.fromisoformat,):
        try:
            return parser(text).date()
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text[:19], fmt).date()
        except ValueError:
            continue
    return None


def fetch_msrc_cvrf(month: str) -> dict[str, Any]:
    """Fetch a CVRF monthly document from Microsoft MSRC Security Update Guide API."""
    if not MONTH_PATTERN.match(month or ""):
        raise MsrcApiError("Ay formatı geçersiz. Örnek format: 2026-May")
    url = f"{MSRC_CVRF_BASE_URL}/{month}"
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json, application/xml;q=0.9, */*;q=0.8", "User-Agent": "Risk-Bulgu-MSRC/1.0"},
    )
    logger.info("MSRC request başladı: month=%s url=%s", month, url)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content_type = response.headers.get("content-type", "")
            status_code = getattr(response, "status", response.getcode())
            body = response.read()
            logger.info("MSRC response status code: %s content_type=%s", status_code, content_type)
            logger.info("MSRC XML length: %s", len(body))
            return {"month": month, "url": url, "status_code": status_code, "content_type": content_type, "body": body.decode("utf-8", "replace")}
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise MsrcApiError(f"{month} için MSRC CVRF verisi bulunamadı.") from exc
        raise MsrcApiError(f"MSRC API hata döndürdü ({exc.code}). Lütfen daha sonra tekrar deneyin.") from exc
    except TimeoutError as exc:
        raise MsrcApiError("MSRC API zaman aşımına uğradı. Lütfen tekrar deneyin.") from exc
    except urllib.error.URLError as exc:
        raise MsrcApiError("MSRC API servisine ulaşılamıyor. Ağ bağlantısını veya proxy ayarlarını kontrol edin.") from exc


def strip_namespace(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def xml_to_dict(element: ET.Element) -> Any:
    children = list(element)
    data: dict[str, Any] = dict(element.attrib)
    text = (element.text or "").strip()
    if not children:
        if data:
            if text:
                data["_text"] = text
            return data
        return text
    for child in children:
        key = strip_namespace(child.tag)
        value = xml_to_dict(child)
        if key in data:
            data[key] = as_list(data[key]) + [value]
        else:
            data[key] = value
    if text:
        data["_text"] = text
    return data


def parse_msrc_cvrf(raw_data: Any) -> dict[str, Any]:
    """Parse MSRC CVRF raw JSON/XML into a Python dictionary."""
    if isinstance(raw_data, dict) and "body" in raw_data:
        raw_text = raw_data.get("body") or ""
    elif isinstance(raw_data, (bytes, bytearray)):
        raw_text = raw_data.decode("utf-8", "replace")
    elif isinstance(raw_data, str):
        raw_text = raw_data
    else:
        return raw_data if isinstance(raw_data, dict) else {}

    raw_text = raw_text.strip()
    if not raw_text:
        return {}
    if raw_text.startswith("{") or raw_text.startswith("["):
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise MsrcApiError(f"MSRC verisi JSON olarak ayrıştırılamadı: {exc}") from exc
    try:
        root = ET.fromstring(raw_text)
        parsed = {strip_namespace(root.tag): xml_to_dict(root)}
        return parsed
    except ET.ParseError as exc:
        raise MsrcApiError(f"MSRC verisi XML olarak ayrıştırılamadı: {exc}") from exc
    except Exception as exc:
        raise MsrcApiError(f"MSRC XML parse sırasında beklenmeyen hata: {type(exc).__name__}: {exc}") from exc


def document_node(parsed_data: dict[str, Any]) -> dict[str, Any]:
    for key in ("cvrfdoc", "Document", "CVRFDocument", "Cvrfdoc"):
        value = parsed_data.get(key)
        if isinstance(value, dict):
            return value
    return parsed_data


def product_map_from_tree(parsed_data: dict[str, Any]) -> dict[str, str]:
    document = document_node(parsed_data)
    product_tree = parsed_data.get("ProductTree") or document.get("ProductTree") or {}
    mapping: dict[str, str] = {}

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            pid = first_text(node.get("ProductID") or node.get("ProductId") or node.get("productID") or node.get("productid"))
            name = first_text(node.get("Value") or node.get("Name") or node.get("FullProductName") or node.get("_text"))
            if pid and name:
                mapping[pid] = name
            for key in ("FullProductName", "Branch", "Relationship", "ProductFamily"):
                for child in as_list(node.get(key)):
                    walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(product_tree)
    return mapping


def extract_notes(vulnerability: dict[str, Any]) -> list[dict[str, Any]]:
    notes = vulnerability.get("Notes") or vulnerability.get("Note") or []
    if isinstance(notes, dict) and "Note" in notes:
        notes = notes.get("Note")
    return [note for note in as_list(notes) if isinstance(note, dict)]


def extract_title(vulnerability: dict[str, Any]) -> str:
    title = first_text(vulnerability.get("Title"))
    if title:
        return title
    for note in extract_notes(vulnerability):
        if first_text(note.get("Title"), "Title").lower() in {"title", "description"}:
            text = first_text(note.get("Value") or note.get("Description") or note.get("_text"))
            if text:
                return text
    return first_text(vulnerability.get("CVE"))


def note_description(vulnerability: dict[str, Any]) -> str:
    values: list[str] = []
    for note in extract_notes(vulnerability):
        text = first_text(note.get("Value") or note.get("Description") or note.get("_text"))
        if text and text not in values:
            values.append(text)
    return "\n".join(values[:3])


def product_ids(value: Any) -> list[str]:
    ids: list[str] = []
    for item in as_list(value):
        if isinstance(item, dict):
            ids.extend(product_ids(item.get("ProductID") or item.get("ProductId") or item.get("Value") or item.get("_text")))
        else:
            text = first_text(item)
            if text:
                ids.append(text)
    return ids


def threat_by_type(vulnerability: dict[str, Any], product_id: str, wanted: set[str]) -> str:
    threats = vulnerability.get("Threats") or vulnerability.get("Threat") or []
    if isinstance(threats, dict) and "Threat" in threats:
        threats = threats.get("Threat")
    for threat in as_list(threats):
        if not isinstance(threat, dict):
            continue
        threat_type = first_text(threat.get("Type")).lower()
        if wanted and threat_type not in wanted:
            continue
        ids = product_ids(threat.get("ProductID") or threat.get("ProductIDs"))
        if ids and product_id and product_id not in ids:
            continue
        text = first_text(threat.get("Description") or threat.get("Value") or threat.get("_text"))
        if text:
            return text
    return ""


def remediation_rows(vulnerability: dict[str, Any]) -> list[dict[str, Any]]:
    rems = vulnerability.get("Remediations") or vulnerability.get("Remediation") or []
    if isinstance(rems, dict) and "Remediation" in rems:
        rems = rems.get("Remediation")
    return [rem for rem in as_list(rems) if isinstance(rem, dict)]


def normalize_msrc_items(parsed_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize CVRF vulnerabilities into one row per CVE/Product/KB/month candidate."""
    try:
        document = document_node(parsed_data)
        vulnerabilities = document.get("Vulnerability") or document.get("Vulnerabilities") or []
    except Exception as exc:
        raise MsrcApiError(f"MSRC verisi normalize edilemedi: {type(exc).__name__}: {exc}") from exc
    if isinstance(vulnerabilities, dict) and "Vulnerability" in vulnerabilities:
        vulnerabilities = vulnerabilities.get("Vulnerability")
    products = product_map_from_tree(parsed_data)
    month = first_text(parsed_data.get("month"))
    tracking = document.get("DocumentTracking") if isinstance(document, dict) else {}
    document_release_date = parse_date((tracking or {}).get("InitialReleaseDate") if isinstance(tracking, dict) else None)
    rows: list[dict[str, Any]] = []
    for vuln in as_list(vulnerabilities):
        if not isinstance(vuln, dict):
            continue
        cve_id = first_text(vuln.get("CVE") or vuln.get("Cve"))
        if not cve_id:
            continue
        title = extract_title(vuln)
        description = note_description(vuln)
        release_date = parse_date(vuln.get("ReleaseDate") or vuln.get("InitialReleaseDate")) or document_release_date
        remediations = remediation_rows(vuln) or [{}]
        exploited = False
        publicly_disclosed = False
        for threat in as_list((vuln.get("Threats") or {}).get("Threat") if isinstance(vuln.get("Threats"), dict) else vuln.get("Threats")):
            if isinstance(threat, dict):
                ttype = first_text(threat.get("Type")).lower()
                desc = first_text(threat.get("Description") or threat.get("Value") or threat.get("_text")).lower()
                if "exploit" in ttype and any(x in desc for x in ["yes", "exploited", "detected"]):
                    exploited = True
                if "disclosed" in ttype and any(x in desc for x in ["yes", "public"]):
                    publicly_disclosed = True
        for remediation in remediations:
            ids = product_ids(remediation.get("ProductID") or remediation.get("ProductIDs")) or [""]
            kb = first_text(remediation.get("SubType")) or first_text(remediation.get("Description"))
            kb_match = re.search(r"KB\d{5,9}", kb or "", flags=re.I)
            kb_article = kb_match.group(0).upper() if kb_match else (kb if kb.upper().startswith("KB") else "")
            fixed_build = first_text(remediation.get("FixedBuild") or remediation.get("RestartRequired"))
            url = first_text(remediation.get("URL") or remediation.get("Url"))
            for pid in ids:
                product = products.get(pid, pid) if pid else ""
                severity = threat_by_type(vuln, pid, {"severity", "maximum severity"}) or first_text(vuln.get("Severity"))
                impact = threat_by_type(vuln, pid, {"impact"}) or first_text(vuln.get("Impact"))
                rows.append({
                    "cve_id": cve_id,
                    "title": title,
                    "severity": severity or first_text(vuln.get("MaxSeverity")),
                    "product": product,
                    "kb_article": kb_article,
                    "fixed_build": fixed_build,
                    "impact": impact or description,
                    "max_severity": first_text(vuln.get("MaxSeverity")) or severity,
                    "publicly_disclosed": publicly_disclosed,
                    "exploited": exploited,
                    "release_month": month,
                    "release_date": release_date,
                    "url": url,
                    "raw_json": json.dumps(vuln, ensure_ascii=False, default=str),
                })
    logger.info("parse edilen vulnerability count: %s", len(rows))
    return rows
