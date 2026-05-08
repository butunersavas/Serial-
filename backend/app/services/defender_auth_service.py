from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

TOKEN_SCOPE = "https://api.securitycenter.microsoft.com/.default"
TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"


@dataclass
class DefenderAuthError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class DefenderAuthService:
    """OAuth2 client-credentials token helper with in-process cache."""

    _cache: dict[tuple[str, str], dict[str, Any]] = {}

    def get_access_token(self, tenant_id: str, client_id: str, client_secret: str) -> str:
        if not tenant_id or not client_id or not client_secret:
            raise DefenderAuthError("Defender API için token alınamadı. Tenant ID, Client ID ve Client Secret bilgilerini kontrol edin.")
        cache_key = (tenant_id, client_id)
        cached = self._cache.get(cache_key)
        now = int(time.time())
        if cached and cached.get("expires_at", 0) - 120 > now:
            return str(cached["access_token"])

        data = urllib.parse.urlencode(
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": TOKEN_SCOPE,
                "grant_type": "client_credentials",
            }
        ).encode()
        request = urllib.request.Request(
            TOKEN_URL.format(tenant_id=urllib.parse.quote(tenant_id)),
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20, context=ssl.create_default_context()) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise DefenderAuthError("Defender API için token alınamadı. Tenant ID, Client ID ve Client Secret bilgilerini kontrol edin.") from exc
        except TimeoutError as exc:
            raise DefenderAuthError("Defender API zaman aşımına uğradı.") from exc
        except ssl.SSLError as exc:
            raise DefenderAuthError("Defender API bağlantısında SSL veya proxy kaynaklı hata oluştu.") from exc
        except Exception as exc:
            raise DefenderAuthError("Defender API için token alınamadı. Tenant ID, Client ID ve Client Secret bilgilerini kontrol edin.") from exc

        token = payload.get("access_token")
        if not token:
            raise DefenderAuthError("Defender API için token alınamadı. Tenant ID, Client ID ve Client Secret bilgilerini kontrol edin.")
        self._cache[cache_key] = {"access_token": token, "expires_at": now + int(payload.get("expires_in", 3600))}
        return str(token)
