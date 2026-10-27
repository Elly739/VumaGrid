"""Small bearer-token authorization layer for the single-node MVP.

Tokens are mapped to tenant IDs in environment configuration. Production
deployments should put these opaque values behind a secret manager and replace
this mechanism with the organization's identity provider before broad rollout.
"""

import json
import os
from hmac import compare_digest

from fastapi import Header, HTTPException


def _token_map(variable: str) -> dict[str, set[str]]:
    raw = os.getenv(variable, "").strip()
    if not raw:
        return {}
    try:
        configured = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{variable} must contain a JSON object mapping tokens to tenant IDs") from exc
    if not isinstance(configured, dict):
        raise RuntimeError(f"{variable} must contain a JSON object mapping tokens to tenant IDs")

    result: dict[str, set[str]] = {}
    for token, tenants in configured.items():
        if not isinstance(token, str) or not token.strip():
            raise RuntimeError(f"{variable} contains an empty token")
        tenant_values = [tenants] if isinstance(tenants, str) else tenants
        if not isinstance(tenant_values, list) or not tenant_values or not all(
            isinstance(tenant, str) and tenant.strip() for tenant in tenant_values
        ):
            raise RuntimeError(f"{variable} values must be tenant ID strings or non-empty lists of tenant IDs")
        result[token] = set(tenant_values)
    return result


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, separator, value = authorization.partition(" ")
    if separator and scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return None


def accessible_tenants(authorization: str | None = Header(default=None)) -> set[str]:
    """Return the caller's tenant scope; showcase mode is intentionally public."""
    if os.getenv("VUMAGRID_DEMO_MODE", "false").lower() in {"1", "true", "yes"}:
        return {site["tenant_id"] for site in _load_demo_sites()}

    configured = _token_map("VUMAGRID_ACCESS_TOKENS")
    token = _bearer_token(authorization)
    for candidate, tenants in configured.items():
        if token and compare_digest(candidate.encode("utf-8"), token.encode("utf-8")):
            return tenants
    if not configured:
        raise HTTPException(status_code=503, detail="Tenant access is not configured. Set VUMAGRID_ACCESS_TOKENS.")
    raise HTTPException(status_code=401, detail="A valid bearer access token is required.")


def require_tenant_access(tenant_id: str, authorization: str | None = Header(default=None)) -> str:
    allowed = accessible_tenants(authorization)
    if tenant_id not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this tenant.")
    return tenant_id


def require_ingestion_tenant(tenant_id: str, authorization: str | None = Header(default=None)) -> str:
    """Validate a device credential and bind it to one tenant before ingest."""
    if os.getenv("VUMAGRID_DEMO_MODE", "false").lower() in {"1", "true", "yes"}:
        return tenant_id
    configured = _token_map("VUMAGRID_INGESTION_TOKENS")
    token = _bearer_token(authorization)
    matched_tenants: set[str] = set()
    for candidate, tenants in configured.items():
        if token and compare_digest(candidate.encode("utf-8"), token.encode("utf-8")):
            matched_tenants = tenants
            break
    if not configured:
        raise HTTPException(status_code=503, detail="Telemetry ingestion is not configured. Set VUMAGRID_INGESTION_TOKENS.")
    if not token:
        raise HTTPException(status_code=401, detail="A valid device bearer token is required.")
    if tenant_id not in matched_tenants:
        raise HTTPException(status_code=403, detail="This device credential is not authorized for the supplied tenant.")
    return tenant_id


def _load_demo_sites() -> list[dict]:
    # Avoid importing storage at module import time; this function only runs for
    # demo requests after FastAPI startup has initialized the database.
    from .storage import load_sites

    sites = load_sites()
    if sites:
        return sites
    return [
        {"tenant_id": "ORG-UPTOWN-HEALTHCARE"},
        {"tenant_id": "ORG-THIKA-TEXTILES"},
        {"tenant_id": "ORG-RIFT-AGRI"},
    ]
