import asyncio
import json
import os
import random
from datetime import datetime, timedelta, timezone

# 1. Profile Definitions for Real Commercial Facilities in Kenya
SITES = [
    {
        "id": "VUMA-NBO-HOSP",
        "name": "Nairobi Uptown Hospital",
        "brand": "HUAWEI_SUN2000",
        "base_load_kw": 120,
        "solar_max_kw": 180,
        "bess_capacity_kwh": 300,
        "current_soc_state": 75.0,
        "tenant_id": "ORG-UPTOWN-HEALTHCARE",
        "asset_type": "COMMERCIAL"
    },
    {
        "id": "VUMA-THK-IND",
        "name": "Thika Textile Factory",
        "brand": "VICTRON_ENERGY",
        "base_load_kw": 250,
        "solar_max_kw": 400,
        "bess_capacity_kwh": 600,
        "current_soc_state": 45.0,
        "tenant_id": "ORG-THIKA-TEXTILES",
        "asset_type": "COMMERCIAL"
    },
    {
        "id": "VUMA-NKR-FARM",
        "name": "Nakuru Irrigation Grid",
        "brand": "SUNGROW_POWER",
        "base_load_kw": 65,
        "solar_max_kw": 110,
        "bess_capacity_kwh": 120,
        "current_soc_state": 55.0,
        "tenant_id": "ORG-RIFT-AGRI",
        "asset_type": "AGRICULTURAL"
    },
]
API_ORIGIN = os.getenv("VUMAGRID_API_URL", "http://127.0.0.1:8013").rstrip("/")
INGESTION_TOKENS = json.loads(os.getenv("VUMAGRID_INGESTION_TOKENS", "{}") or "{}")
NAIROBI_TIMEZONE = timezone(timedelta(hours=3), name="EAT")


def get_kplc_tariff(hour):
    """Returns official Kenya Power Time-of-Use (ToU) commercial tariff rates in KES."""
    if 18 <= hour <= 22:
        return 24.50  # Evening Peak hours (Most expensive)
    elif 0 <= hour <= 6:
        return 12.00  # Late Night Off-Peak hours (Cheapest)
    else:
        return 19.80  # Standard daytime rate


def generate_telemetry(site):
    """Generates authentic manufacturer-specific register logs."""
    now = datetime.now(NAIROBI_TIMEZONE)
    hour = now.hour

    # Generate solar bell curve peaking between 11:00 AM and 2:00 PM
    solar_gen = 0.0
    if 6 <= hour <= 18:
        bell_curve = max(0, 1 - abs(hour - 13) / 6)
        solar_gen = round(site["solar_max_kw"] * bell_curve * random.uniform(0.85, 1.05), 1)

    # Generate load fluctuations based on commercial activity patterns
    load = round(site["base_load_kw"] * random.uniform(0.80, 1.20), 1)

    # 5% probability of an immediate KPLC blackout state
    grid_status = "ONLINE" if random.random() > 0.05 else "OFFLINE"
    tariff = get_kplc_tariff(hour)

    # Artificially degrade battery health on Thika site to feed Fault Detection AI later
    soh = random.uniform(94.0, 99.0) if site["id"] != "VUMA-THK-IND" else random.uniform(76.0, 81.0)

    net_energy_balance = solar_gen - load

    if grid_status == "OFFLINE":
        charge_adjustment = (net_energy_balance / site["bess_capacity_kwh"]) * 100 * (5 / 3600)
    else:
        if tariff <= 12.00:
            charge_adjustment = (50.0 / site["bess_capacity_kwh"]) * 100 * (5 / 3600)
        else:
            charge_adjustment = (net_energy_balance / site["bess_capacity_kwh"]) * 100 * (5 / 3600) if net_energy_balance < 0 else 0.1

    site["current_soc_state"] = max(15.0, min(98.0, site["current_soc_state"] + charge_adjustment))

    if site["brand"] == "HUAWEI_SUN2000":
        return {
            "metadata": {"brand": "HUAWEI", "device_uid": site["id"], "timestamp": now.isoformat()},
            "registers": {
                "tenant_id": site["tenant_id"],
                "asset_type": site["asset_type"],
                "active_power_output_kw": solar_gen,
                "total_current_load_kw": load,
                "bess_state_of_charge_pct": round(site["current_soc_state"], 1),
                "battery_health_soh": round(soh, 1),
                "grid_voltage_status": 1 if grid_status == "ONLINE" else 0,
                "active_tariff_kes": tariff,
            },
        }

    if site["brand"] == "VICTRON_ENERGY":
        return {
            "victron_venus_payload": {
                "tenant_id": site["tenant_id"],
                "asset_type": site["asset_type"],
                "system_id": site["id"],
                "epoch_time": int(now.timestamp()),
                "pv_yield_kw": solar_gen,
                "consumption_ac_load_kw": load,
                "soc_percentage": round(site["current_soc_state"], 1),
                "battery_health_pct": round(soh, 1),
                "grid_state": "connected" if grid_status == "ONLINE" else "alarm_active",
                "kplc_cost_per_kwh": tariff,
            }
        }

    return {
        "sungrow_data": {
            "tenant_id": site["tenant_id"],
            "asset_type": site["asset_type"],
            "station_code": site["id"],
            "sync_date": now.strftime("%Y-%m-%d %H:%M:%S"),
            "array_power_kw": solar_gen,
            "load_power_kw": load,
            "bess_cap_left_pct": round(site["current_soc_state"], 1),
            "state_of_health": round(soh, 1),
            "grid_relay_closed": True if grid_status == "ONLINE" else False,
            "billing_rate_kes": tariff,
        }
    }


async def execution_loop():
    import httpx

    print("VumaGrid Live Net-Routing Inverter Simulator Enabled.")

    async with httpx.AsyncClient() as client:
        while True:
            print(f"\n--- Emulated Network Push: {datetime.now().strftime('%H:%M:%S')} ---")
            for site in SITES:
                payload = generate_telemetry(site)
                print(f"[EMULATED RAW STREAM] {site['brand']} -> Created for {site['id']}")

                if site["brand"] == "HUAWEI_SUN2000":
                    url = f"{API_ORIGIN}/api/v1/telemetry/huawei"
                elif site["brand"] == "VICTRON_ENERGY":
                    url = f"{API_ORIGIN}/api/v1/telemetry/victron"
                else:
                    url = f"{API_ORIGIN}/api/v1/telemetry/sungrow"

                try:
                    tenant_id = site["tenant_id"]
                    device_token = next((token for token, scope in INGESTION_TOKENS.items()
                                         if tenant_id in ([scope] if isinstance(scope, str) else scope)), None)
                    headers = {"Authorization": f"Bearer {device_token}"} if device_token else {}
                    response = await client.post(url, json=payload, headers=headers)
                    print(f"[PUSH SUCCESS] {site['id']} -> Status Code: {response.status_code}")
                except Exception as e:
                    print(f"[NETWORK ROUTE FAILURE] Could not reach server core for {site['id']}: {str(e)}")

            await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(execution_loop())
    except KeyboardInterrupt:
        print("\nSimulator stopped gracefully.")
