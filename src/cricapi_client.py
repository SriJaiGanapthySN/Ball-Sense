"""Thin wrapper around the CricAPI (https://cricapi.com/) free-tier REST endpoints.

The API key is never hardcoded; it must be supplied by the caller (read from the
CRICAPI_KEY environment variable by the app).
"""
import os
import time
from datetime import datetime, timezone
from hashlib import sha256
from threading import Lock

import requests

BASE_URL = "https://api.cricapi.com/v1"
_TIMEOUT = 15

# Optional path to a corporate root CA bundle (PEM), for networks that TLS-intercept
# traffic (common on corporate VPNs/proxies). Never disables verification outright.
_CA_BUNDLE = os.getenv("CRICAPI_CA_BUNDLE") or True

# CricAPI's free tier only allows ~100 hits/day, shared across every user of this app -
# a short in-memory cache means repeated clicks (double-clicks, revisiting the Live tab)
# reuse the last response instead of spending a new hit. Failures (including quota-exceeded)
# are cached too, briefly, so a burst of retries during an outage/quota-exhausted window
# doesn't keep hammering CricAPI for nothing.
_CACHE_TTL_MATCHES = 300
_cache: dict[tuple, tuple[float, object]] = {}
_cache_lock = Lock()


class CricApiError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _cached(key: tuple, ttl: float, fetch):
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > time.monotonic():
            value = cached[1]
            if isinstance(value, Exception):
                raise value
            return value
        try:
            value = fetch()
        except CricApiError as exc:
            _cache[key] = (time.monotonic() + ttl, exc)
            raise
        _cache[key] = (time.monotonic() + ttl, value)
        return value


def _get(endpoint: str, api_key: str, params: dict | None = None) -> dict:
    if not api_key:
        raise CricApiError("Missing CricAPI key. Set CRICAPI_KEY in your .env file.")
    query = {"apikey": api_key, **(params or {})}
    try:
        resp = requests.get(f"{BASE_URL}/{endpoint}", params=query, timeout=_TIMEOUT, verify=_CA_BUNDLE)
        resp.raise_for_status()
    except requests.exceptions.SSLError as exc:
        raise CricApiError(
            "TLS certificate verification failed. If you're on a corporate network/VPN "
            "that intercepts TLS, ask IT for the corporate root CA (PEM file) and set "
            "CRICAPI_CA_BUNDLE=<path-to-cert.pem> in your .env file."
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise CricApiError("CricAPI is temporarily unreachable. Please try again later.") from exc
    try:
        payload = resp.json()
    except ValueError as exc:
        raise CricApiError("CricAPI returned an invalid response. Please try again later.") from exc
    if not isinstance(payload, dict):
        raise CricApiError("CricAPI returned an invalid response.")
    if payload.get("status") not in ("success", None):
        reason = payload.get("reason")
        info = payload.get("info") or {}
        try:
            hits_today = int(info.get("hitsToday", 0))
            hits_limit = int(info.get("hitsLimit", 0))
        except (TypeError, ValueError):
            hits_today, hits_limit = 0, 0
        if hits_limit > 0 and hits_today >= hits_limit:
            raise CricApiError(
                f"CricAPI daily quota exceeded ({hits_today}/{hits_limit} hits used today). "
                "Try again after the quota resets, or upgrade your CricAPI plan.",
                status_code=429,
            )
        status_code = 429 if any(word in str(reason).lower() for word in ("quota", "limit")) else 502
        message = str(reason or payload.get("status") or "CricAPI request failed").replace(api_key, "[redacted]")
        raise CricApiError(message, status_code)
    return payload


def get_current_matches(api_key: str) -> list[dict]:
    """Returns a list of currently live/recent matches with basic team/score info."""
    return get_current_matches_feed(api_key)["matches"]


def get_current_matches_feed(api_key: str) -> dict:
    """Return provider data and the timestamp of its last successful fetch."""
    def _fetch():
        payload = _get("currentMatches", api_key, {"offset": 0})
        matches = payload.get("data")
        if not isinstance(matches, list) or any(not isinstance(match, dict) for match in matches):
            raise CricApiError("CricAPI returned an invalid match list.")
        return {
            "matches": matches,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "CricAPI",
            "refresh_after_seconds": _CACHE_TTL_MATCHES,
        }

    key = ("currentMatches", sha256(api_key.encode()).hexdigest())
    return _cached(key, _CACHE_TTL_MATCHES, _fetch)


def get_series_list(api_key: str, offset: int = 0) -> list[dict]:
    """Returns a paginated list of series known to CricAPI (id, name, dates)."""
    payload = _get("series", api_key, {"offset": offset})
    return payload.get("data", [])
