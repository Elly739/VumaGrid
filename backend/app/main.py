from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from .models import UnifiedTelemetry
from .optimizer import EnergyOrchestrator

app = FastAPI(title="VumaGrid DERMS Core Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIVE_STATE_CACHE = {}

# Historical tracking accumulator to simulate carbon tracking metrics over time
CARBON_HISTORY = {
    "total_clean_energy_generated_kwh": 14250.0,
    "total_co2_saved_kg": 5415.0,
    "diesel_liters_displaced": 1820.0,
}


def seed_demo_state_cache() -> None:
    """Populate the dashboard cache with a realistic default site snapshot when the engine starts."""
    if LIVE_STATE_CACHE:
        return

    demo_sites = [
        {
            "site_id": "VUMA-NBO-HOSP",
            "site_name": "Nairobi Uptown Hospital",
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
            "site_id": "VUMA-THK-IND",
            "site_name": "Thika Textile Factory",
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
            "site_id": "VUMA-MSA-MALL",
            "site_name": "Mombasa Retail Center",
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


def run_fault_detection_ai(telemetry: UnifiedTelemetry) -> list:
    """Industrial Anomaly Detection Engine identifying structural failures and safety risks."""
    alerts = []
    current_hour = telemetry.timestamp.hour

    # 1. Solar System Degradation / Failure Check
    if 10 <= current_hour <= 15 and telemetry.solar_generation_kw < 5.0:
        alerts.append(
            {
                "severity": "CRITICAL",
                "type": "INVERTER_FAULT",
                "message": f"Zero solar yield detected at peak daylight hour ({current_hour}:00). Check inverter relay configuration.",
            }
        )

    # 2. Battery State of Health (SOH) Decay Threshold
    if telemetry.battery_soh_pct < 80.0:
        alerts.append(
            {
                "severity": "WARNING",
                "type": "BATTERY_DEGRADATION",
                "message": f"Battery capacity health dropped to {telemetry.battery_soh_pct}%. Optimization bounds throttled to prevent cell swelling.",
            }
        )

    # 3. Abnormal High Consumption Spikes (Theft/Leakage Check)
    if telemetry.facility_load_kw > 450.0:
        alerts.append(
            {
                "severity": "CRITICAL",
                "type": "LOAD_ANOMALY",
                "message": "Critical electrical demand spike detected. Verify sub-meter circuits for load leakage or unauthorized grid drain.",
            }
        )

    return alerts


def run_carbon_intelligence(telemetry: UnifiedTelemetry, optimized_dispatch: dict) -> dict:
    """Calculates real-time Environmental, Social, and Governance (ESG) sustainability metrics."""
    GRID_EMISSION_FACTOR = 0.38

    solar_kwh_interval = telemetry.solar_generation_kw * (5 / 3600)
    co2_saved_interval_kg = solar_kwh_interval * GRID_EMISSION_FACTOR

    CARBON_HISTORY["total_clean_energy_generated_kwh"] += solar_kwh_interval
    CARBON_HISTORY["total_co2_saved_kg"] += co2_saved_interval_kg

    return {
        "co2_saved_kg_current": round(co2_saved_interval_kg, 4),
        "cumulative_co2_saved_metric_tons": round(CARBON_HISTORY["total_co2_saved_kg"] / 1000, 3),
        "total_clean_energy_generated_mwh": round(CARBON_HISTORY["total_clean_energy_generated_kwh"] / 1000, 2),
        "diesel_generators_displaced_liters": CARBON_HISTORY["diesel_liters_displaced"],
    }


@app.post("/api/v1/telemetry/huawei")
async def ingest_huawei(payload: dict):
    try:
        meta = payload["metadata"]
        regs = payload["registers"]
        normalized = UnifiedTelemetry(
            site_id=meta["device_uid"],
            brand=meta["brand"],
            timestamp=datetime.fromisoformat(meta["timestamp"]),
            solar_generation_kw=regs["active_power_output_kw"],
            facility_load_kw=regs["total_current_load_kw"],
            battery_soc_pct=regs["bess_state_of_charge_pct"],
            battery_soh_pct=regs["battery_health_soh"],
            grid_online=True if regs["grid_voltage_status"] == 1 else False,
            current_tariff_kes=regs["active_tariff_kes"],
        )
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Huawei register key: {str(e)}")


@app.post("/api/v1/telemetry/victron")
async def ingest_victron(payload: dict):
    try:
        data = payload["victron_venus_payload"]
        normalized = UnifiedTelemetry(
            site_id=data["system_id"],
            brand="VICTRON",
            timestamp=datetime.fromtimestamp(data["epoch_time"]),
            solar_generation_kw=data["pv_yield_kw"],
            facility_load_kw=data["consumption_ac_load_kw"],
            battery_soc_pct=data["soc_percentage"],
            battery_soh_pct=data["battery_health_pct"],
            grid_online=True if data["grid_state"] == "connected" else False,
            current_tariff_kes=data["kplc_cost_per_kwh"],
        )
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Victron key: {str(e)}")


@app.post("/api/v1/telemetry/sungrow")
async def ingest_sungrow(payload: dict):
    try:
        data = payload["sungrow_data"]
        normalized = UnifiedTelemetry(
            site_id=data["station_code"],
            brand="SUNGROW",
            timestamp=datetime.strptime(data["sync_date"], "%Y-%m-%d %H:%M:%S"),
            solar_generation_kw=data["array_power_kw"],
            facility_load_kw=data["load_power_kw"],
            battery_soc_pct=data["bess_cap_left_pct"],
            battery_soh_pct=data["state_of_health"],
            grid_online=data["grid_relay_closed"],
            current_tariff_kes=data["billing_rate_kes"],
        )
        LIVE_STATE_CACHE[normalized.site_id] = normalized.model_dump()
        return {"status": "success", "site": normalized.site_id}
    except KeyError as e:
        raise HTTPException(status_code=422, detail=f"Missing expected Sungrow key: {str(e)}")


@app.get("/api/v1/dashboard/state")
async def get_live_states():
    seed_demo_state_cache()
    response_data = []
    for site_id, data in LIVE_STATE_CACHE.items():
        telemetry_obj = UnifiedTelemetry(**data)

        base_score = 100.0
        health_score = round(base_score - telemetry_obj.calculate_health_penalty(), 1)

        optimization_decision = EnergyOrchestrator.optimize_dispatch(
            solar_kw=telemetry_obj.solar_generation_kw,
            load_kw=telemetry_obj.facility_load_kw,
            soc_pct=telemetry_obj.battery_soc_pct,
            grid_online=telemetry_obj.grid_online,
            tariff_kes=telemetry_obj.current_tariff_kes,
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
