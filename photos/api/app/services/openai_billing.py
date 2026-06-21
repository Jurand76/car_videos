"""Saldo / kredyty OpenAI (nieoficjalne endpointy billing dashboard + Usage API)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview"
ADMIN_KEY_URL = "https://platform.openai.com/settings/organization/admin-keys"
CACHE_TTL_SECONDS = 300

_cache: dict[str, Any] | None = None
_cache_expires_at: datetime | None = None


def _money(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


async def _get_json(client: httpx.AsyncClient, path: str) -> tuple[dict[str, Any] | None, int]:
    response = await client.get(path)
    if response.status_code == 200:
        payload = response.json()
        return (payload if isinstance(payload, dict) else None), 200
    logger.debug("OpenAI billing %s -> %s", path, response.status_code)
    return None, response.status_code


def _parse_credit_grants(payload: dict[str, Any]) -> dict[str, float | None]:
    total_available = _money(payload.get("total_available"))
    total_used = _money(payload.get("total_used"))
    total_granted = _money(payload.get("total_granted"))

    grants = payload.get("grants")
    if isinstance(grants, dict):
        data = grants.get("data")
        if isinstance(data, list) and data:
            if total_granted is None:
                total_granted = sum(_money(g.get("grant_amount")) or 0 for g in data)
            if total_used is None:
                total_used = sum(_money(g.get("used_amount")) or 0 for g in data)
            if total_available is None:
                total_available = sum(
                    (_money(g.get("grant_amount")) or 0) - (_money(g.get("used_amount")) or 0)
                    for g in data
                )

    return {
        "granted_usd": total_granted,
        "used_usd": total_used,
        "available_usd": total_available,
    }


async def _fetch_month_spend(client: httpx.AsyncClient) -> tuple[float | None, int | None]:
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # end_time powoduje puste results[] — OpenAI zwraca koszty tylko ze start_time
    params = {
        "start_time": int(start.timestamp()),
        "bucket_width": "1d",
        "limit": 31,
    }
    response = await client.get("/v1/organization/costs", params=params)
    if response.status_code != 200:
        return None, response.status_code

    payload = response.json()
    buckets = payload.get("data")
    if not isinstance(buckets, list):
        return None, 200

    total = 0.0
    found = False
    for bucket in buckets:
        results = bucket.get("results") if isinstance(bucket, dict) else None
        if not isinstance(results, list):
            continue
        for row in results:
            raw_amount = row.get("amount")
            if isinstance(raw_amount, dict):
                amount = _money(raw_amount.get("value"))
            else:
                amount = _money(raw_amount)
            if amount is not None:
                total += amount
                found = True
    return (round(total, 2) if found else 0.0), 200


async def get_openai_billing_snapshot(*, fresh: bool = False) -> dict[str, Any]:
    global _cache, _cache_expires_at

    now = datetime.now(timezone.utc)
    if not fresh and _cache and _cache_expires_at and now < _cache_expires_at:
        return _cache

    settings = get_settings()
    if not settings.openai_api_key:
        return {
            "status": "no_key",
            "available_usd": None,
            "granted_usd": None,
            "used_usd": None,
            "pending_usd": None,
            "month_spend_usd": None,
            "message": "Brak OPENAI_API_KEY w project.env",
            "billing_url": BILLING_URL,
            "updated_at": now.isoformat(),
        }

    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    granted = used = available = pending = month_spend = None
    status = "unavailable"
    message = (
        "Saldo prepaid nie jest dostępne przez zwykły klucz API — "
        "zobacz panel billing OpenAI"
    )
    costs_status: int | None = None

    async with httpx.AsyncClient(
        timeout=20.0,
        headers=headers,
        base_url="https://api.openai.com",
    ) as client:
        for path in (
            "/v1/dashboard/billing/credit_grants",
            "/dashboard/billing/credit_grants",
        ):
            payload, code = await _get_json(client, path)
            if payload:
                parsed = _parse_credit_grants(payload)
                granted = parsed["granted_usd"]
                used = parsed["used_usd"]
                available = parsed["available_usd"]
                status = "ok"
                message = "Pozostałe kredyty prepaid na koncie OpenAI"
                break
            if code == 403:
                logger.debug("credit_grants wymaga session key (przeglądarka), nie secret key")

        pending_payload, _ = await _get_json(client, "/v1/dashboard/billing/pending_usage")
        if not pending_payload:
            pending_payload, _ = await _get_json(client, "/dashboard/billing/pending_usage")
        if pending_payload:
            pending = _money(pending_payload.get("total_usage") or pending_payload.get("amount"))

        if available is not None and pending is not None:
            available = round(max(0.0, available - pending), 2)

    usage_key = settings.openai_admin_api_key or settings.openai_api_key
    usage_headers = {"Authorization": f"Bearer {usage_key}"}
    async with httpx.AsyncClient(
        timeout=20.0,
        headers=usage_headers,
        base_url="https://api.openai.com",
    ) as usage_client:
        month_spend, costs_status = await _fetch_month_spend(usage_client)

    if month_spend is not None and status != "ok":
        status = "usage_only"
        if month_spend > 0:
            message = "Wydatki API w tym miesiącu (saldo $ tylko w panelu OpenAI)"
        else:
            message = "Brak zarejestrowanych wydatków w tym miesiącu — koszty mogą pojawić się z opóźnieniem"
    elif costs_status == 403:
        message = (
            "Dodaj OPENAI_ADMIN_API_KEY ze scope api.usage.read, "
            "żeby zobaczyć wydatki — saldo $ zostaje w panelu billing"
        )

    result = {
        "status": status,
        "available_usd": available,
        "granted_usd": granted,
        "used_usd": used,
        "pending_usd": pending,
        "month_spend_usd": month_spend,
        "message": message,
        "billing_url": BILLING_URL if status == "ok" else ADMIN_KEY_URL if costs_status == 403 else BILLING_URL,
        "updated_at": now.isoformat(),
    }

    _cache = result
    _cache_expires_at = now + timedelta(seconds=CACHE_TTL_SECONDS)
    return result

