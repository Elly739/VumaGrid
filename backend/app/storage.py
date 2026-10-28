"""Small SQLite repository for the single-node Vuma Grid MVP."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timezone
from collections.abc import Iterable, Iterator


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "vumagrid.db"
DB_PATH = Path(os.getenv("VUMAGRID_DB_PATH", str(DEFAULT_DB_PATH))).expanduser()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_storage() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS site_state (
                tenant_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (tenant_id, site_id)
            );
            CREATE TABLE IF NOT EXISTS telemetry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                solar_generation_kw REAL NOT NULL,
                facility_load_kw REAL NOT NULL,
                battery_soc_pct REAL NOT NULL,
                current_tariff_kes REAL NOT NULL,
                grid_online INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_telemetry_site_time
                ON telemetry_history (tenant_id, site_id, timestamp);
            CREATE TABLE IF NOT EXISTS alert_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT NOT NULL,
                site_id TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                resolved_at TEXT,
                acknowledged_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_alert_tenant_active
                ON alert_history (tenant_id, resolved_at, first_seen);
            """
        )


def save_telemetry(payload: dict) -> None:
    initialize_storage()
    stored_payload = dict(payload)
    timestamp = datetime.fromisoformat(str(payload["timestamp"]))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    timestamp = timestamp.astimezone(timezone.utc)
    stored_payload["timestamp"] = timestamp.isoformat()
    with _connect() as connection:
        connection.execute(
            """INSERT INTO site_state (tenant_id, site_id, asset_type, payload_json)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (tenant_id, site_id) DO UPDATE SET
                   asset_type = excluded.asset_type,
                   payload_json = excluded.payload_json""",
            (payload["tenant_id"], payload["site_id"], payload["asset_type"], json.dumps(stored_payload, default=str)),
        )
        connection.execute(
            """INSERT INTO telemetry_history
               (tenant_id, site_id, timestamp, solar_generation_kw, facility_load_kw,
                battery_soc_pct, current_tariff_kes, grid_online)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload["tenant_id"], payload["site_id"], timestamp.isoformat(),
                payload["solar_generation_kw"], payload["facility_load_kw"],
                payload["battery_soc_pct"], payload["current_tariff_kes"],
                int(payload["grid_online"]),
            ),
        )


def load_sites(tenant_id: str | None = None, asset_type: str | None = None) -> list[dict]:
    initialize_storage()
    clauses = []
    values: list[str] = []
    if tenant_id:
        clauses.append("tenant_id = ?")
        values.append(tenant_id)
    if asset_type:
        clauses.append("asset_type = ?")
        values.append(asset_type)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with _connect() as connection:
        rows = connection.execute(f"SELECT payload_json FROM site_state{where} ORDER BY site_id", values).fetchall()
    return [json.loads(row["payload_json"]) for row in rows]


def has_sites() -> bool:
    initialize_storage()
    with _connect() as connection:
        return connection.execute("SELECT 1 FROM site_state LIMIT 1").fetchone() is not None


def sync_site_alerts(tenant_id: str, site_id: str, alerts: list[dict], timestamp: datetime) -> list[str]:
    """Persist current conditions, resolving cleared alerts and returning newly opened types."""
    initialize_storage()
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    timestamp_text = timestamp.astimezone(timezone.utc).isoformat()
    current_by_type = {alert["type"]: alert for alert in alerts}
    newly_opened: list[str] = []

    with _connect() as connection:
        open_rows = connection.execute(
            "SELECT id, alert_type FROM alert_history WHERE tenant_id = ? AND site_id = ? AND resolved_at IS NULL",
            (tenant_id, site_id),
        ).fetchall()
        open_by_type = {row["alert_type"]: row for row in open_rows}

        for alert_type, row in open_by_type.items():
            if alert_type not in current_by_type:
                connection.execute(
                    "UPDATE alert_history SET resolved_at = ? WHERE id = ?",
                    (timestamp_text, row["id"]),
                )

        for alert_type, alert in current_by_type.items():
            existing = open_by_type.get(alert_type)
            if existing:
                connection.execute(
                    "UPDATE alert_history SET severity = ?, message = ?, last_seen = ? WHERE id = ?",
                    (alert["severity"], alert["message"], timestamp_text, existing["id"]),
                )
            else:
                connection.execute(
                    """INSERT INTO alert_history
                       (tenant_id, site_id, alert_type, severity, message, first_seen, last_seen)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (tenant_id, site_id, alert_type, alert["severity"], alert["message"], timestamp_text, timestamp_text),
                )
                newly_opened.append(alert_type)
    return newly_opened


def load_active_alerts(tenant_ids: Iterable[str] | None = None) -> list[dict]:
    initialize_storage()
    query = """SELECT id, tenant_id, site_id, alert_type AS type, severity, message,
                      first_seen, last_seen, acknowledged_at
               FROM alert_history WHERE resolved_at IS NULL"""
    values: list[str] = []
    if tenant_ids is not None:
        tenant_list = list(tenant_ids)
        if not tenant_list:
            return []
        placeholders = ",".join("?" for _ in tenant_list)
        query += f" AND tenant_id IN ({placeholders})"
        values.extend(tenant_list)
    query += " ORDER BY first_seen DESC, id DESC"
    with _connect() as connection:
        rows = connection.execute(query, values).fetchall()
    return [dict(row) for row in rows]


def load_alert(alert_id: int) -> dict | None:
    initialize_storage()
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, tenant_id, site_id, resolved_at FROM alert_history WHERE id = ?",
            (alert_id,),
        ).fetchone()
    return dict(row) if row else None


def acknowledge_alert(alert_id: int) -> dict | None:
    initialize_storage()
    acknowledged_at = datetime.now(timezone.utc).isoformat()
    with _connect() as connection:
        connection.execute(
            "UPDATE alert_history SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ? AND resolved_at IS NULL",
            (acknowledged_at, alert_id),
        )
        row = connection.execute(
            """SELECT id, tenant_id, site_id, alert_type AS type, severity, message,
                      first_seen, last_seen, resolved_at, acknowledged_at
               FROM alert_history WHERE id = ? AND resolved_at IS NULL""",
            (alert_id,),
        ).fetchone()
    return dict(row) if row else None


def load_site_history(
    site_id: str,
    tenant_id: str | None = None,
    since_timestamp: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    initialize_storage()
    query = """SELECT timestamp, solar_generation_kw, facility_load_kw, battery_soc_pct,
                      current_tariff_kes, grid_online
               FROM telemetry_history WHERE site_id = ?"""
    values: list[str] = [site_id]
    if tenant_id:
        query += " AND tenant_id = ?"
        values.append(tenant_id)
    if since_timestamp:
        query += " AND timestamp >= ?"
        values.append(since_timestamp)
    query += " ORDER BY timestamp DESC"
    if limit is not None:
        query += " LIMIT ?"
        values.append(str(limit))
    with _connect() as connection:
        rows = connection.execute(query, values).fetchall()
    result = [dict(row) for row in rows]
    result.sort(key=lambda row: datetime.fromisoformat(row["timestamp"]))
    return result


def load_energy_totals(tenant_id: str | None = None) -> dict[str, dict[str, float]]:
    """Integrate solar power over recorded intervals, skipping gaps over 15 minutes."""
    initialize_storage()
    query = """SELECT tenant_id, site_id, timestamp, solar_generation_kw
               FROM telemetry_history"""
    values: list[str] = []
    if tenant_id:
        query += " WHERE tenant_id = ?"
        values.append(tenant_id)
    query += " ORDER BY tenant_id, site_id, timestamp"
    totals: dict[str, dict[str, float]] = {}
    previous: dict[tuple[str, str], sqlite3.Row] = {}
    with _connect() as connection:
        rows = connection.execute(query, values).fetchall()
    for row in rows:
        tenant = row["tenant_id"]
        key = (tenant, row["site_id"])
        current_time = datetime.fromisoformat(row["timestamp"])
        prior = previous.get(key)
        if prior:
            elapsed_hours = (current_time - datetime.fromisoformat(prior["timestamp"])).total_seconds() / 3600
            if 0 < elapsed_hours <= 0.25:
                energy_kwh = prior["solar_generation_kw"] * elapsed_hours
                aggregate = totals.setdefault(tenant, {"clean_energy_generated_kwh": 0.0, "co2_saved_kg": 0.0})
                aggregate["clean_energy_generated_kwh"] += energy_kwh
                aggregate["co2_saved_kg"] += energy_kwh * 0.38
        previous[key] = row
    for aggregate in totals.values():
        aggregate["clean_energy_generated_kwh"] = round(aggregate["clean_energy_generated_kwh"], 3)
        aggregate["co2_saved_kg"] = round(aggregate["co2_saved_kg"], 3)
    return totals
