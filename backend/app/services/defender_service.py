from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .defender_auth_service import DefenderAuthService

DEFAULT_DEFENDER_API_BASE_URL = "https://api.security.microsoft.com"


@dataclass
class DefenderApiError(Exception):
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.message


class DefenderService:
    def __init__(self, auth_service: DefenderAuthService | None = None) -> None:
        self.auth_service = auth_service or DefenderAuthService()

    def _token(self, settings: Any) -> str:
        return self.auth_service.get_access_token(settings.tenant_id, settings.client_id, settings.client_secret_encrypted_or_masked)

    def _request(self, settings: Any, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        base_url = (settings.api_base_url or DEFAULT_DEFENDER_API_BASE_URL).rstrip("/")
        clean_params = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        query = f"?{urllib.parse.urlencode(clean_params)}" if clean_params else ""
        request = urllib.request.Request(
            f"{base_url}{path}{query}",
            headers={"Authorization": f"Bearer {self._token(settings)}", "Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=30, context=ssl.create_default_context()) as response:
                return json.loads(response.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            if exc.code == 403:
                raise DefenderApiError("Yetki yetersiz. Entra uygulamasına gerekli Defender API izinlerini verin.", 403) from exc
            if exc.code == 401:
                raise DefenderApiError("Kimlik doğrulama başarısız.", 401) from exc
            raise DefenderApiError(f"Defender API hatası: HTTP {exc.code}", exc.code) from exc
        except TimeoutError as exc:
            raise DefenderApiError("Defender API zaman aşımına uğradı.", 504) from exc
        except ssl.SSLError as exc:
            raise DefenderApiError("Defender API bağlantısında SSL veya proxy kaynaklı hata oluştu.", 502) from exc
        except Exception as exc:
            message = str(exc)
            if "timed out" in message.lower():
                raise DefenderApiError("Defender API zaman aşımına uğradı.", 504) from exc
            raise DefenderApiError("Defender API bağlantısında SSL veya proxy kaynaklı hata oluştu.", 502) from exc

    def list_all(self, settings: Any, path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        next_link: str | None = None
        current_params = dict(params or {})
        while True:
            if next_link:
                base_url = (settings.api_base_url or DEFAULT_DEFENDER_API_BASE_URL).rstrip("/")
                parsed = urllib.parse.urlparse(next_link)
                path = parsed.path.replace(urllib.parse.urlparse(base_url).path, "") or parsed.path
                current_params = dict(urllib.parse.parse_qsl(parsed.query))
            payload = self._request(settings, path, current_params)
            batch = payload.get("value", payload if isinstance(payload, list) else [])
            if isinstance(batch, list):
                items.extend(batch)
            next_link = payload.get("@odata.nextLink") or payload.get("nextLink")
            if not next_link:
                break
        return items

    def vulnerabilities(self, settings: Any, **params: Any) -> list[dict[str, Any]]:
        return self.list_all(settings, "/api/vulnerabilities", params)

    def machines_vulnerabilities(self, settings: Any, **params: Any) -> list[dict[str, Any]]:
        return self.list_all(settings, "/api/vulnerabilities/machinesVulnerabilities", params)

    def recommendations(self, settings: Any, **params: Any) -> list[dict[str, Any]]:
        return self.list_all(settings, "/api/recommendations", params)

    def machine_vulnerabilities(self, settings: Any, machine_id: str, **params: Any) -> list[dict[str, Any]]:
        return self.list_all(settings, f"/api/machines/{urllib.parse.quote(machine_id)}/vulnerabilities", params)
