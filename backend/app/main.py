from fastapi import FastAPI, HTTPException, Body, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from datetime import datetime, timedelta, timezone
import io
import ipaddress
import json
import os
import requests
from pydantic import ValidationError

from .models import UnifiedTelemetry
from .optimizer import EnergyOrchestrator
from .security import accessible_tenants, require_ingestion_tenant, require_tenant_access
from .storage import has_sites, initialize_storage, load_energy_totals, load_site_history, load_sites, save_telemetry

app = FastAPI(title="VumaGrid DERMS Core Engine", version="1.1.0")

cors_origins = [origin.strip() for origin in os.getenv(
    "VUMAGRID_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_MODE = os.getenv("VUMAGRID_DEMO_MODE", "false").lower() in {"1", "true", "yes"}
NAIROBI_TIMEZONE = timezone(timedelta(hours=3), name="EAT")


@app.middleware("http")
async def keep_demo_mode_local(request, call_next):
    if DEMO_MODE:
        client_host = request.client.host if request.client else ""
        try:
            if not ipaddress.ip_address(client_host).is_loopback:
                return Response(status_code=403, content='{"detail":"Demo mode is available only from this machine."}', media_type="application/json")
        except ValueError:
            return Response(status_code=403, content='{"detail":"Demo mode is available only from this machine."}', media_type="application/json")
    return await call_next(request)

DEMO_ALERTS_WEBHOOK = os.getenv("VUMAGRID_ALERTS_WEBHOOK", "")


def tenant_alert_webhook(tenant_id: str) -> str:
    """Resolve a tenant-specific alert destination; never fan out across tenants."""
    raw = os.getenv("VUMAGRID_ALERTS_WEBHOOKS", "").strip()
    if raw:
        try:
            destinations = json.loads(raw)
        except ValueError as exc:
            raise RuntimeError("VUMAGRID_ALERTS_WEBHOOKS must be a JSON object mapping tenant IDs to webhook URLs") from exc
        if not isinstance(destinations, dict):
            raise RuntimeError("VUMAGRID_ALERTS_WEBHOOKS must be a JSON object mapping tenant IDs to webhook URLs")
        return str(destinations.get(tenant_id, ""))
    if DEMO_MODE:
        return DEMO_ALERTS_WEBHOOK
    return ""


def seed_demo_state_cache() -> None:
    if has_sites():
        return

    demo_sites = [
        {
            "data_source": "DEMO",
            "tenant_id": "ORG-UPTOWN-HEALTHCARE",
            "site_id": "VUMA-NBO-HOSP",
            "site_name": "Nairobi Uptown Hospital",
            "asset_type": "COMMERCIAL",
            "brand": "HUAWEI",
            "timestamp": datetime.now(NAIROBI_TIMEZONE),
            "solar_generation_kw": 146.0,
            "facility_load_kw": 118.0,
            "battery_soc_pct": 81.0,
            "battery_soh_pct": 96.0,
            "grid_online": True,
            "current_tariff_kes": 19.8,
        },
        {
            "data_source": "DEMO",
            "tenant_id": "ORG-THIKA-TEXTILES",
            "site_id": "VUMA-THK-IND",
            "site_name": "Thika Textile Factory",
            "asset_type": "COMMERCIAL",
            "brand": "VICTRON",
            "timestamp": datetime.now(NAIROBI_TIMEZONE),
            "solar_generation_kw": 284.0,
            "facility_load_kw": 312.0,
            "battery_soc_pct": 39.0,
            "battery_soh_pct": 78.0,
            "grid_online": True,
            "current_tariff_kes": 24.5,
        },
        {
            "data_source": "DEMO",
            "tenant_id": "ORG-RIFT-AGRI",
            "site_id": "VUMA-NKR-FARM",
            "site_name": "Nakuru Irrigation Grid",
            "asset_type": "AGRICULTURAL",
            "brand": "SUNGROW",
            "timestamp": datetime.now(NAIROBI_TIMEZONE),
            "solar_generation_kw": 114.0,
            "facility_load_kw": 97.0,
            "battery_soc_pct": 88.0,
            "battery_soh_pct": 95.0,
            "grid_online": False,
            "current_tariff_kes": 12.0,
        },
    ]

    for site_data in demo_sites:
        save_telemetry(site_data)


@app.on_event("startup")
def startup() -> None:
    initialize_storage()


@app.get("/")
def health_check():
    return {"status": "ok", "service": "VumaGrid DERMS Core Engine", "storage": "sqlite"}


def dispatch_safety_alert_webhook(alert_type: str, severity: str, message: str, site_id: str, tenant_id: str):
    webhook_url = tenant_alert_webhook(tenant_id)
    if not webhook_url:
        return
    payload = {
        "content": f"** VUMAGRID FAULT AI ALERT ** [{severity}]",
        "embeds": [{
            "title": f"System Anomaly Isolated: {alert_type}",
            "description": message,
            "color": 15158332 if severity == "CRITICAL" else 15105570,
            "fields": [
                {"name": "Node ID", "value": site_id, "inline": True},
                {"name": "Timestamp", "value": datetime.now().strftime('%Y-%m-%d %H:%M:%S'), "inline": True}
            ],
            "footer": {"text": "VumaGrid Core Diagnostics Gateway"}
        }]
    }
    try:
        requests.post(webhook_url, json=payload, timeout=2.0)
    except Exception:
        pass


@app.post("/api/v1/sandbox/webhook-logger")
def local_webhook_receiver_sandbox(payload: dict):
    if not DEMO_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    print(f"[WEBHOOK DISPATCHED TO SIMULATED GATEWAY]: {payload.get('content')}")
    return {"status": "logged_to_terminal"}


def run_fault_detection_ai(telemetry: UnifiedTelemetry, dispatch_webhooks: bool = False) -> list:
    alerts = []
    current_hour = telemetry.timestamp.hour

    if 10 <= current_hour <= 15 and telemetry.solar_generation_kw < 5.0:
        alert = {
            "severity": "CRITICAL",
            "type": "INVERTER_FAULT",
            "message": f"Zero solar yield detected at peak daylight hour ({current_hour}:00). Check inverter relay configuration."
        }
        alerts.append(alert)
        if dispatch_webhooks:
            dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id, telemetry.tenant_id)

    if telemetry.battery_soh_pct < 80.0:
        alert = {
            "severity": "WARNING",
            "type": "BATTERY_DEGRADATION",
            "message": f"Battery capacity health dropped to {telemetry.battery_soh_pct}%. Optimization bounds throttled to prevent cell swelling."
        }
        alerts.append(alert)
        if dispatch_webhooks:
            dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id, telemetry.tenant_id)

    if telemetry.facility_load_kw > 450.0:
        alert = {
            "severity": "CRITICAL",
            "type": "LOAD_ANOMALY",
            "message": "Critical electrical demand spike detected. Verify sub-meter circuits for load leakage or unauthorized grid drain."
        }
        alerts.append(alert)
        if dispatch_webhooks:
            dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id, telemetry.tenant_id)

    return alerts


def run_carbon_intelligence(telemetry: UnifiedTelemetry, optimized_dispatch: dict, totals: dict[str, float]) -> dict:
    GRID_EMISSION_FACTOR = 0.38
    solar_kwh_interval = telemetry.solar_generation_kw * (5 / 3600)
    co2_saved_interval_kg = solar_kwh_interval * GRID_EMISSION_FACTOR

    return {
        "co2_saved_kg_current": round(co2_saved_interval_kg, 4),
        "cumulative_co2_saved_metric_tons": round(totals.get("co2_saved_kg", 0.0) / 1000, 3),
        "total_clean_energy_generated_mwh": round(totals.get("clean_energy_generated_kwh", 0.0) / 1000, 2),
        "diesel_generators_displaced_liters": 0.0
    }


def record_telemetry(telemetry: UnifiedTelemetry) -> None:
    payload = telemetry.model_dump(mode="json")
    payload["data_source"] = "INGESTED"
    save_telemetry(payload)
    # Evaluate and dispatch once per received sample, never as a side effect of dashboard reads.
    run_fault_detection_ai(telemetry, dispatch_webhooks=True)


@app.post("/api/v1/telemetry/huawei")
def ingest_huawei(payload: dict, authorization: str | None = Header(default=None)):
    try:
        meta = payload["metadata"]
        regs = payload["registers"]
        normalized = UnifiedTelemetry(
            tenant_id=regs["tenant_id"],
            site_id=meta["device_uid"],
            asset_type=regs["asset_type"],
            brand=meta["brand"],
            timestamp=datetime.fromisoformat(meta["timestamp"]),
            solar_generation_kw=regs["active_power_output_kw"],
            facility_load_kw=regs["total_current_load_kw"],
            battery_soc_pct=regs["bess_state_of_charge_pct"],
            battery_soh_pct=regs["battery_health_soh"],
            grid_online=True if regs["grid_voltage_status"] == 1 else False,
            current_tariff_kes=regs["active_tariff_kes"]
        )
        require_ingestion_tenant(normalized.tenant_id, authorization)
        record_telemetry(normalized)
        return {"status": "success", "site": normalized.site_id}
    except (KeyError, TypeError, ValueError, ValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid or missing Huawei register value: {str(e)}")


@app.post("/api/v1/telemetry/victron")
def ingest_victron(payload: dict, authorization: str | None = Header(default=None)):
    try:
        data = payload["victron_venus_payload"]
        normalized = UnifiedTelemetry(
            tenant_id=data["tenant_id"],
            site_id=data["system_id"],
            asset_type=data["asset_type"],
            brand="VICTRON",
            timestamp=datetime.fromtimestamp(data["epoch_time"], tz=timezone.utc),
            solar_generation_kw=data["pv_yield_kw"],
            facility_load_kw=data["consumption_ac_load_kw"],
            battery_soc_pct=data["soc_percentage"],
            battery_soh_pct=data["battery_health_pct"],
            grid_online=True if data["grid_state"] == "connected" else False,
            current_tariff_kes=data["kplc_cost_per_kwh"]
        )
        require_ingestion_tenant(normalized.tenant_id, authorization)
        record_telemetry(normalized)
        return {"status": "success", "site": normalized.site_id}
    except (KeyError, TypeError, ValueError, ValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid or missing Victron value: {str(e)}")


@app.post("/api/v1/telemetry/sungrow")
def ingest_sungrow(payload: dict, authorization: str | None = Header(default=None)):
    try:
        data = payload["sungrow_data"]
        normalized = UnifiedTelemetry(
            tenant_id=data["tenant_id"],
            site_id=data["station_code"],
            asset_type=data["asset_type"],
            brand="SUNGROW",
            timestamp=datetime.strptime(data["sync_date"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=NAIROBI_TIMEZONE),
            solar_generation_kw=data["array_power_kw"],
            facility_load_kw=data["load_power_kw"],
            battery_soc_pct=data["bess_cap_left_pct"],
            battery_soh_pct=data["state_of_health"],
            grid_online=data["grid_relay_closed"],
            current_tariff_kes=data["billing_rate_kes"]
        )
        require_ingestion_tenant(normalized.tenant_id, authorization)
        record_telemetry(normalized)
        return {"status": "success", "site": normalized.site_id}
    except (KeyError, TypeError, ValueError, ValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid or missing Sungrow value: {str(e)}")


@app.get("/api/v1/dashboard/state")
def get_live_states(
    tenant_id: str = None,
    asset_type: str = None,
    authorization: str | None = Header(default=None),
):
    if DEMO_MODE and not has_sites():
        seed_demo_state_cache()
    allowed_tenants = accessible_tenants(authorization)
    if tenant_id and tenant_id not in allowed_tenants:
        require_tenant_access(tenant_id, authorization)
    response_data = []
    energy_totals_by_tenant = load_energy_totals()
    for data in load_sites(asset_type=asset_type):
        if data["tenant_id"] not in allowed_tenants or (tenant_id and data["tenant_id"] != tenant_id):
            continue
        telemetry_obj = UnifiedTelemetry(**data)
        base_score = 100.0
        health_score = round(base_score - telemetry_obj.calculate_health_penalty(), 1)
        optimization_decision = EnergyOrchestrator.optimize_dispatch(
            solar_kw=telemetry_obj.solar_generation_kw,
            load_kw=telemetry_obj.facility_load_kw,
            soc_pct=telemetry_obj.battery_soc_pct,
            grid_online=telemetry_obj.grid_online,
            tariff_kes=telemetry_obj.current_tariff_kes
        )
        fault_alerts = run_fault_detection_ai(telemetry_obj)
        esg_metrics = run_carbon_intelligence(
            telemetry_obj, optimization_decision,
            energy_totals_by_tenant.get(data["tenant_id"], {}),
        )

        data_copy = data.copy()
        data_copy["energy_health_score"] = health_score
        data_copy["optimization"] = optimization_decision
        data_copy["fault_alerts"] = fault_alerts
        data_copy["carbon_intelligence"] = esg_metrics
        response_data.append(data_copy)
    return response_data


@app.get("/api/v1/tenants")
def get_tenants(authorization: str | None = Header(default=None)):
    if DEMO_MODE and not has_sites():
        seed_demo_state_cache()
    allowed_tenants = accessible_tenants(authorization)
    tenants: dict[str, dict] = {}
    for site in load_sites():
        tenant_id = site["tenant_id"]
        if tenant_id not in allowed_tenants:
            continue
        tenant = tenants.setdefault(tenant_id, {"tenant_id": tenant_id, "site_count": 0})
        tenant["site_count"] += 1
    return sorted(tenants.values(), key=lambda tenant: tenant["tenant_id"])


@app.get("/api/v1/sites/{site_id}/history")
def get_site_history(
    site_id: str,
    tenant_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    authorization: str | None = Header(default=None),
):
    require_tenant_access(tenant_id, authorization)
    site = next((row for row in load_sites(tenant_id=tenant_id) if row["site_id"] == site_id), None)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found for this tenant.")
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    return load_site_history(site_id, tenant_id, since_timestamp=since, limit=500)


@app.post("/api/v1/analytics/simulate-investment")
def run_investment_simulation(
    site_id: str = Body(...),
    tenant_id: str = Body(...),
    current_bess_kwh: float = Body(..., gt=0),
    upgraded_capacity_kwh: float = Body(..., gt=0),
    estimated_cost_kes: float = Body(..., ge=0),
    authorization: str | None = Header(default=None),
):
    require_tenant_access(tenant_id, authorization)
    if current_bess_kwh <= 0 or upgraded_capacity_kwh <= current_bess_kwh or estimated_cost_kes < 0:
        raise HTTPException(status_code=422, detail="Current capacity must be positive, upgrade capacity must be greater than current capacity, and cost cannot be negative.")

    site = next((row for row in load_sites(tenant_id=tenant_id) if row["site_id"] == site_id), None)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found for this tenant.")

    site_history = load_site_history(site_id, tenant_id=tenant_id)
    if len(site_history) < 12:
        raise HTTPException(status_code=422, detail="Investment analysis needs at least 12 recorded telemetry samples.")

    first_sample = datetime.fromisoformat(site_history[0]["timestamp"])
    last_sample = datetime.fromisoformat(site_history[-1]["timestamp"])
    if (last_sample - first_sample).total_seconds() < 24 * 60 * 60:
        raise HTTPException(status_code=422, detail="Investment analysis needs at least 24 hours of recorded telemetry for this site.")
    if len(site_history) < 288:
        raise HTTPException(status_code=422, detail="Investment analysis needs at least 288 telemetry samples across the 24-hour window.")
    largest_gap = max(
        (datetime.fromisoformat(next_row["timestamp"]) - datetime.fromisoformat(row["timestamp"])).total_seconds()
        for row, next_row in zip(site_history, site_history[1:])
    )
    if largest_gap > 15 * 60:
        raise HTTPException(status_code=422, detail="Telemetry coverage has a gap over 15 minutes; collect a more complete 24-hour window first.")

    results = EnergyOrchestrator.simulate_investment_roi(
        historical_logs=site_history,
        current_bess_kwh=current_bess_kwh,
        upgraded_bess_kwh=upgraded_capacity_kwh,
        battery_cost_kes=estimated_cost_kes
    )
    return results


@app.get("/api/v1/analytics/export-esg-report")
def export_esg_pdf_report(
    tenant_id: str = None,
    authorization: str | None = Header(default=None),
):
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    allowed_tenants = accessible_tenants(authorization)
    if tenant_id and tenant_id not in allowed_tenants:
        require_tenant_access(tenant_id, authorization)

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)

    p.setFillColorRGB(0.04, 0.09, 0.15)
    p.rect(0, 700, 612, 100, fill=True, stroke=False)

    p.setFillColorRGB(1.0, 1.0, 1.0)
    p.setFont("Helvetica-Bold", 18)

    title_text = f"VUMA GRID RECONCILIATION AUDIT: {tenant_id}" if tenant_id else "VUMA GRID RECONCILIATION AUDIT: DEMO_NETWORK"
    p.drawString(30, 745, title_text.replace("RECONCILIATION AUDIT", "ENERGY SUMMARY"))

    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.06, 0.72, 0.50)
    p.drawString(30, 720, f"SOURCE: STORED TELEMETRY // GENERATED: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(30, 650, "Aggregated Environmental Impact Benchmarks:")

    p.setFont("Helvetica", 11)
    report_totals = load_energy_totals(tenant_id=tenant_id) if tenant_id else {
        key: value for key, value in load_energy_totals().items() if key in allowed_tenants
    }
    if tenant_id:
        report_energy = report_totals.get(tenant_id, {"clean_energy_generated_kwh": 0.0, "co2_saved_kg": 0.0})
    else:
        report_energy = {
            "clean_energy_generated_kwh": sum(item["clean_energy_generated_kwh"] for item in report_totals.values()),
            "co2_saved_kg": sum(item["co2_saved_kg"] for item in report_totals.values()),
        }
    p.drawString(30, 620, f"• Integrated Clean Generation:     {round(report_energy['clean_energy_generated_kwh'], 2)} kWh")
    p.drawString(30, 595, f"• Estimated Avoided CO2:     {round(report_energy['co2_saved_kg'] / 1000, 3)} Metric Tonnes")

    p.setFont("Helvetica-Bold", 12)
    p.drawString(30, 530, "Monitored Network Infrastructure Nodes:")

    y_cursor = 500
    p.setFont("Helvetica", 10)
    for data in load_sites(tenant_id=tenant_id):
        if data["tenant_id"] not in allowed_tenants:
            continue
        site_id = data["site_id"]
        p.drawString(40, y_cursor, f"-> Node: {site_id} | Class: {data.get('asset_type')} | Solar Output: {data['solar_generation_kw']}kW | Battery: {data['battery_soc_pct']}% SoC")
        y_cursor -= 25

    p.showPage()
    p.save()
    buffer.seek(0)

    filename = f"ESG_Report_{tenant_id}.pdf" if tenant_id else "ESG_Report_Showcase.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
