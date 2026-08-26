from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from datetime import datetime
import io
import requests

from .models import UnifiedTelemetry
from .optimizer import EnergyOrchestrator

app = FastAPI(title="VumaGrid DERMS Core Engine", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIVE_STATE_CACHE = {}
HISTORICAL_LOGS_DB = []

CARBON_HISTORY = {
    "total_clean_energy_generated_kwh": 14250.0,
    "total_co2_saved_kg": 5415.0,
    "diesel_liters_displaced": 1820.0
}

EXTERNAL_ALERTS_WEBHOOK = "http://127.0.0.1:8013/api/v1/sandbox/webhook-logger"


def seed_demo_state_cache() -> None:
    if LIVE_STATE_CACHE:
        return

    demo_sites = [
        {
            "tenant_id": "ORG-UPTOWN-HEALTHCARE",
            "site_id": "VUMA-NBO-HOSP",
            "site_name": "Nairobi Uptown Hospital",
            "asset_type": "COMMERCIAL",
            "brand": "HUAWEI",
            "timestamp": datetime.now(),
            "solar_generation_kw": 146.0,
            "facility_load_kw": 118.0,
            "battery_soc_pct": 81.0,
            "battery_soh_pct": 96.0,
            "grid_online": True,
            "current_tariff_kes": 19.8,
        },
        {
            "tenant_id": "ORG-THIKA-TEXTILES",
            "site_id": "VUMA-THK-IND",
            "site_name": "Thika Textile Factory",
            "asset_type": "COMMERCIAL",
            "brand": "VICTRON",
            "timestamp": datetime.now(),
            "solar_generation_kw": 284.0,
            "facility_load_kw": 312.0,
            "battery_soc_pct": 39.0,
            "battery_soh_pct": 78.0,
            "grid_online": True,
            "current_tariff_kes": 24.5,
        },
        {
            "tenant_id": "ORG-RIFT-AGRI",
            "site_id": "VUMA-NKR-FARM",
            "site_name": "Nakuru Irrigation Grid",
            "asset_type": "AGRICULTURAL",
            "brand": "SUNGROW",
            "timestamp": datetime.now(),
            "solar_generation_kw": 114.0,
            "facility_load_kw": 97.0,
            "battery_soc_pct": 88.0,
            "battery_soh_pct": 95.0,
            "grid_online": False,
            "current_tariff_kes": 12.0,
        },
    ]

    for site_data in demo_sites:
        LIVE_STATE_CACHE[site_data["site_id"]] = site_data


@app.get("/")
def health_check():
    return {"status": "VumaGrid Core Online", "active_connections": len(LIVE_STATE_CACHE)}


def dispatch_safety_alert_webhook(alert_type: str, severity: str, message: str, site_id: str):
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
        requests.post(EXTERNAL_ALERTS_WEBHOOK, json=payload, timeout=2.0)
    except Exception:
        pass


@app.post("/api/v1/sandbox/webhook-logger")
def local_webhook_receiver_sandbox(payload: dict):
    print(f"[WEBHOOK DISPATCHED TO SIMULATED GATEWAY]: {payload.get('content')}")
    return {"status": "logged_to_terminal"}


def run_fault_detection_ai(telemetry: UnifiedTelemetry) -> list:
    alerts = []
    current_hour = telemetry.timestamp.hour

    if 10 <= current_hour <= 15 and telemetry.solar_generation_kw < 5.0:
        alert = {
            "severity": "CRITICAL",
            "type": "INVERTER_FAULT",
            "message": f"Zero solar yield detected at peak daylight hour ({current_hour}:00). Check inverter relay configuration."
        }
        alerts.append(alert)
        dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id)

    if telemetry.battery_soh_pct < 80.0:
        alert = {
            "severity": "WARNING",
            "type": "BATTERY_DEGRADATION",
            "message": f"Battery capacity health dropped to {telemetry.battery_soh_pct}%. Optimization bounds throttled to prevent cell swelling."
        }
        alerts.append(alert)
        dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id)

    if telemetry.facility_load_kw > 450.0:
        alert = {
            "severity": "CRITICAL",
            "type": "LOAD_ANOMALY",
            "message": "Critical electrical demand spike detected. Verify sub-meter circuits for load leakage or unauthorized grid drain."
        }
        alerts.append(alert)
        dispatch_safety_alert_webhook(alert["type"], alert["severity"], alert["message"], telemetry.site_id)

    return alerts


def run_carbon_intelligence(telemetry: UnifiedTelemetry, optimized_dispatch: dict) -> dict:
    GRID_EMISSION_FACTOR = 0.38
    solar_kwh_interval = telemetry.solar_generation_kw * (5 / 3600)
    co2_saved_interval_kg = solar_kwh_interval * GRID_EMISSION_FACTOR

    CARBON_HISTORY["total_clean_energy_generated_kwh"] += solar_kwh_interval
    CARBON_HISTORY["total_co2_saved_kg"] += co2_saved_interval_kg

    return {
        "co2_saved_kg_current": round(co2_saved_interval_kg, 4),
        "cumulative_co2_saved_metric_tons": round(CARBON_HISTORY["total_co2_saved_kg"] / 1000, 3),
        "total_clean_energy_generated_mwh": round(CARBON_HISTORY["total_clean_energy_generated_kwh"] / 1000, 2),
        "diesel_generators_displaced_liters": CARBON_HISTORY["diesel_liters_displaced"]
    }


@app.post("/api/v1/telemetry/huawei")
async def ingest_huawei(payload: dict):
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
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        HISTORICAL_LOGS_DB.append({"site_id": normalized.site_id, "solar_generation_kw": normalized.solar_generation_kw, "facility_load_kw": normalized.facility_load_kw, "current_tariff_kes": normalized.current_tariff_kes, "grid_online": normalized.grid_online})
        if len(HISTORICAL_LOGS_DB) > 5000: HISTORICAL_LOGS_DB.pop(0)
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Huawei register key: {str(e)}")


@app.post("/api/v1/telemetry/victron")
async def ingest_victron(payload: dict):
    try:
        data = payload["victron_venus_payload"]
        normalized = UnifiedTelemetry(
            tenant_id=data["tenant_id"],
            site_id=data["system_id"],
            asset_type=data["asset_type"],
            brand="VICTRON",
            timestamp=datetime.fromtimestamp(data["epoch_time"]),
            solar_generation_kw=data["pv_yield_kw"],
            facility_load_kw=data["consumption_ac_load_kw"],
            battery_soc_pct=data["soc_percentage"],
            battery_soh_pct=data["battery_health_pct"],
            grid_online=True if data["grid_state"] == "connected" else False,
            current_tariff_kes=data["kplc_cost_per_kwh"]
        )
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        HISTORICAL_LOGS_DB.append({"site_id": normalized.site_id, "solar_generation_kw": normalized.solar_generation_kw, "facility_load_kw": normalized.facility_load_kw, "current_tariff_kes": normalized.current_tariff_kes, "grid_online": normalized.grid_online})
        if len(HISTORICAL_LOGS_DB) > 5000: HISTORICAL_LOGS_DB.pop(0)
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Victron key: {str(e)}")


@app.post("/api/v1/telemetry/sungrow")
async def ingest_sungrow(payload: dict):
    try:
        data = payload["sungrow_data"]
        normalized = UnifiedTelemetry(
            tenant_id=data["tenant_id"],
            site_id=data["station_code"],
            asset_type=data["asset_type"],
            brand="SUNGROW",
            timestamp=datetime.strptime(data["sync_date"], "%Y-%m-%d %H:%M:%S"),
            solar_generation_kw=data["array_power_kw"],
            facility_load_kw=data["load_power_kw"],
            battery_soc_pct=data["bess_cap_left_pct"],
            battery_soh_pct=data["state_of_health"],
            grid_online=data["grid_relay_closed"],
            current_tariff_kes=data["billing_rate_kes"]
        )
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        HISTORICAL_LOGS_DB.append({"site_id": normalized.site_id, "solar_generation_kw": normalized.solar_generation_kw, "facility_load_kw": normalized.facility_load_kw, "current_tariff_kes": normalized.current_tariff_kes, "grid_online": normalized.grid_online})
        if len(HISTORICAL_LOGS_DB) > 5000: HISTORICAL_LOGS_DB.pop(0)
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Sungrow key: {str(e)}")


@app.get("/api/v1/dashboard/state")
async def get_live_states(tenant_id: str = None, asset_type: str = None):
    seed_demo_state_cache()
    response_data = []
    for site_id, data in LIVE_STATE_CACHE.items():
        if tenant_id and data.get("tenant_id") != tenant_id:
            continue
        if asset_type and data.get("asset_type") != asset_type:
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
        esg_metrics = run_carbon_intelligence(telemetry_obj, optimization_decision)

        data_copy = data.copy()
        data_copy["energy_health_score"] = health_score
        data_copy["optimization"] = optimization_decision
        data_copy["fault_alerts"] = fault_alerts
        data_copy["carbon_intelligence"] = esg_metrics
        response_data.append(data_copy)
    return response_data


@app.post("/api/v1/analytics/simulate-investment")
async def run_investment_simulation(
    site_id: str = Body(...),
    upgraded_capacity_kwh: float = Body(...),
    estimated_cost_kes: float = Body(...)
):
    site_history = [log for log in HISTORICAL_LOGS_DB if log["site_id"] == site_id]
    if len(site_history) < 12:
        import random
        site_history = [
            {"site_id": site_id, "solar_generation_kw": random.uniform(40, 150), "facility_load_kw": random.uniform(80, 200), "current_tariff_kes": 24.50, "grid_online": True},
            {"site_id": site_id, "solar_generation_kw": random.uniform(80, 250), "facility_load_kw": random.uniform(100, 220), "current_tariff_kes": 19.80, "grid_online": True},
            {"site_id": site_id, "solar_generation_kw": 0.0, "facility_load_kw": random.uniform(60, 120), "current_tariff_kes": 12.00, "grid_online": True}
        ] * 8

    current_capacity = 300.0
    if site_id in LIVE_STATE_CACHE:
        current_capacity = LIVE_STATE_CACHE[site_id]["battery_soc_pct"]

    results = EnergyOrchestrator.simulate_investment_roi(
        historical_logs=site_history,
        current_bess_kwh=current_capacity,
        upgraded_bess_kwh=upgraded_capacity_kwh,
        battery_cost_kes=estimated_cost_kes
    )
    return results


@app.get("/api/v1/analytics/export-esg-report")
def export_esg_pdf_report(tenant_id: str = None):
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)

    p.setFillColorRGB(0.04, 0.09, 0.15)
    p.rect(0, 700, 612, 100, fill=True, stroke=False)

    p.setFillColorRGB(1.0, 1.0, 1.0)
    p.setFont("Helvetica-Bold", 18)

    title_text = f"VUMA GRID RECONCILIATION AUDIT: {tenant_id}" if tenant_id else "VUMA GRID RECONCILIATION AUDIT: DEMO_NETWORK"
    p.drawString(30, 745, title_text)

    p.setFont("Helvetica", 9)
    p.setFillColorRGB(0.06, 0.72, 0.50)
    p.drawString(30, 720, f"AUTHENTICATED COMPLIANCE SOURCE // TIMESTAMP: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    p.setFillColorRGB(0.1, 0.1, 0.1)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(30, 650, "Aggregated Environmental Impact Benchmarks:")

    p.setFont("Helvetica", 11)
    p.drawString(30, 620, f"• System Clean Generation Target Yield:     {round(CARBON_HISTORY['total_clean_energy_generated_kwh'], 2)} kWh")
    p.drawString(30, 595, f"• Computed Avoided Metric CO2 Volume:     {round(CARBON_HISTORY['total_co2_saved_kg'] / 1000, 3)} Metric Tonnes")

    p.setFont("Helvetica-Bold", 12)
    p.drawString(30, 530, "Monitored Network Infrastructure Nodes:")

    y_cursor = 500
    p.setFont("Helvetica", 10)
    for site_id, data in LIVE_STATE_CACHE.items():
        if tenant_id and data.get("tenant_id") != tenant_id:
            continue

        p.drawString(40, y_cursor, f"-> Node: {site_id} | Class: {data.get('asset_type')} | Solar Output: {data['solar_generation_kw']}kW | Battery: {data['battery_soc_pct']}% SoC")
        y_cursor -= 25

    p.showPage()
    p.save()
    buffer.seek(0)

    filename = f"ESG_Report_{tenant_id}.pdf" if tenant_id else "ESG_Report_Showcase.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
