import asyncio
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

# Synthetic site profiles for a local demonstration; these are not measured sites.
SITES = [
    {
        "id": "VUMA-NBO-HOSP",
        "name": "Nairobi Uptown Hospital",
        "brand": "HUAWEI_SUN2000",
        "base_load_kw": 120,
        "solar_max_kw": 180,
        "solar_inverter_kw": 180,
        "bess_capacity_kwh": 300,
        "max_battery_charge_kw": 60,
        "max_battery_discharge_kw": 100,
        "max_grid_import_kw": 300,
        "initial_soc_pct": 75.0,
        "initial_soh_pct": 97.0,
        "tenant_id": "ORG-UPTOWN-HEALTHCARE",
        "asset_type": "COMMERCIAL",
        "load_profile": "hospital",
    },
    {
        "id": "VUMA-THK-IND",
        "name": "Thika Textile Factory",
        "brand": "VICTRON_ENERGY",
        "base_load_kw": 250,
        "solar_max_kw": 400,
        "solar_inverter_kw": 400,
        "bess_capacity_kwh": 600,
        "max_battery_charge_kw": 120,
        "max_battery_discharge_kw": 200,
        "max_grid_import_kw": 600,
        "initial_soc_pct": 45.0,
        "initial_soh_pct": 78.0,
        "tenant_id": "ORG-THIKA-TEXTILES",
        "asset_type": "COMMERCIAL",
        "load_profile": "industrial",
    },
    {
        "id": "VUMA-NKR-FARM",
        "name": "Nakuru Irrigation Grid",
        "brand": "SUNGROW_POWER",
        "base_load_kw": 65,
        "solar_max_kw": 110,
        "solar_inverter_kw": 110,
        "bess_capacity_kwh": 120,
        "max_battery_charge_kw": 24,
        "max_battery_discharge_kw": 40,
        "max_grid_import_kw": 150,
        "initial_soc_pct": 55.0,
        "initial_soh_pct": 96.0,
        "tenant_id": "ORG-RIFT-AGRI",
        "asset_type": "AGRICULTURAL",
        "load_profile": "irrigation",
    },
]
API_ORIGIN = os.getenv("VUMAGRID_API_URL", "http://127.0.0.1:8013").rstrip("/")
INGESTION_TOKENS = json.loads(os.getenv("VUMAGRID_INGESTION_TOKENS", "{}") or "{}")
NAIROBI_TIMEZONE = timezone(timedelta(hours=3), name="EAT")
SIMULATION_INTERVAL_SECONDS = 5
MIN_BATTERY_SOC_PCT = 15.0
CHARGE_EFFICIENCY = 0.95
DISCHARGE_EFFICIENCY = 0.95
SIMULATION_SCENARIOS = {"normal", "cloudy", "grid_outage", "low_battery"}


def get_kplc_tariff(hour):
    """Return demonstration time-of-use rates; these are not verified customer tariffs."""
    if 18 <= hour <= 22:
        return 24.50  # Evening Peak hours (Most expensive)
    elif 0 <= hour <= 6:
        return 12.00  # Late Night Off-Peak hours (Cheapest)
    else:
        return 19.80  # Standard daytime rate


class TelemetrySimulator:
    """Generate seeded, internally balanced demo telemetry for fixed site profiles."""

    def __init__(self, seed=42, scenario="normal", profiles=None):
        if scenario not in SIMULATION_SCENARIOS:
            raise ValueError(f"Unknown simulation scenario: {scenario}")
        self.random = random.Random(seed)
        self.scenario = scenario
        self.profiles = profiles or SITES
        self.states = {}
        self.last_power_flow = {}

        for site in self.profiles:
            starting_soc = 20.0 if scenario == "low_battery" else site["initial_soc_pct"]
            forced_outage = 30 * 60 if scenario == "grid_outage" and site["id"] == "VUMA-NKR-FARM" else 0
            self.states[site["id"]] = {
                "stored_energy_kwh": site["bess_capacity_kwh"] * starting_soc / 100,
                "cloud_factor": 0.9,
                "load_factor": 1.0,
                "outage_seconds_remaining": forced_outage,
            }

    def _grid_is_online(self, site, state):
        interval = SIMULATION_INTERVAL_SECONDS
        if state["outage_seconds_remaining"] > 0:
            state["outage_seconds_remaining"] = max(0, state["outage_seconds_remaining"] - interval)
            return False
        if self.scenario == "grid_outage" and site["id"] == "VUMA-NKR-FARM":
            return True

        outage_probability = 1 - math.exp(-0.02 * interval / 3600)
        if self.random.random() < outage_probability:
            state["outage_seconds_remaining"] = self.random.randint(15 * 60, 60 * 60)
            return False
        return True

    @staticmethod
    def _load_shape(profile, hour):
        daylight = max(0.0, math.sin(math.pi * (hour - 6) / 12))
        if profile == "hospital":
            return 0.92 + 0.08 * daylight + 0.025 * math.sin(2 * math.pi * hour / 24)
        if profile == "industrial":
            return 0.78 + 0.28 * daylight
        return 0.72 + 0.38 * daylight

    def generate_telemetry(self, site, now=None):
        """Return vendor-shaped telemetry after one constrained five-second plant step."""
        now = now or datetime.now(NAIROBI_TIMEZONE)
        local_time = now.astimezone(NAIROBI_TIMEZONE)
        hour = local_time.hour + local_time.minute / 60 + local_time.second / 3600
        state = self.states[site["id"]]
        interval_hours = SIMULATION_INTERVAL_SECONDS / 3600
        daylight = max(0.0, math.sin(math.pi * (hour - 6) / 12))

        if self.scenario == "cloudy":
            cloud_target = self.random.uniform(0.2, 0.5)
        else:
            cloud_target = self.random.uniform(0.75, 1.0)
        state["cloud_factor"] = 0.9 * state["cloud_factor"] + 0.1 * cloud_target
        solar_available = min(
            site["solar_inverter_kw"],
            site["solar_max_kw"] * daylight * state["cloud_factor"] * self.random.uniform(0.98, 1.02),
        )

        load_target = self.random.uniform(0.985, 1.015)
        state["load_factor"] = 0.9 * state["load_factor"] + 0.1 * load_target
        load = site["base_load_kw"] * self._load_shape(site["load_profile"], hour) * state["load_factor"]
        grid_online = self._grid_is_online(site, state)
        tariff = get_kplc_tariff(local_time.hour)
        capacity = site["bess_capacity_kwh"]
        stored_energy = state["stored_energy_kwh"]
        minimum_energy = capacity * MIN_BATTERY_SOC_PCT / 100

        solar_surplus = max(0.0, solar_available - load)
        load_deficit = max(0.0, load - solar_available)
        charge_kw = min(
            solar_surplus,
            site["max_battery_charge_kw"],
            max(0.0, capacity - stored_energy) / (interval_hours * CHARGE_EFFICIENCY),
        )
        discharge_kw = 0.0
        if not grid_online or tariff >= 24.5:
            discharge_kw = min(
                load_deficit,
                site["max_battery_discharge_kw"],
                max(0.0, stored_energy - minimum_energy) * DISCHARGE_EFFICIENCY / interval_hours,
            )

        remaining_deficit = max(0.0, load_deficit - discharge_kw)
        grid_draw_kw = min(remaining_deficit, site["max_grid_import_kw"]) if grid_online else 0.0
        unserved_load_kw = max(0.0, remaining_deficit - grid_draw_kw)
        curtailed_solar_kw = max(0.0, solar_surplus - charge_kw)
        next_energy = stored_energy + charge_kw * interval_hours * CHARGE_EFFICIENCY
        next_energy -= discharge_kw * interval_hours / DISCHARGE_EFFICIENCY
        state["stored_energy_kwh"] = min(capacity, max(minimum_energy, next_energy))

        balance_error = (
            solar_available + discharge_kw + grid_draw_kw
            - (load - unserved_load_kw + charge_kw + curtailed_solar_kw)
        )
        if abs(balance_error) > 1e-6:
            raise RuntimeError(f"Power balance failed for {site['id']}: {balance_error} kW")

        soc = state["stored_energy_kwh"] / capacity * 100
        self.last_power_flow[site["id"]] = {
            "solar_kw": solar_available,
            "load_kw": load,
            "grid_draw_kw": grid_draw_kw,
            "battery_charge_kw": charge_kw,
            "battery_discharge_kw": discharge_kw,
            "curtailed_solar_kw": curtailed_solar_kw,
            "unserved_load_kw": unserved_load_kw,
            "grid_online": grid_online,
        }

        if site["brand"] == "HUAWEI_SUN2000":
            return {
                "metadata": {"brand": "HUAWEI", "device_uid": site["id"], "timestamp": now.isoformat()},
                "registers": {
                    "tenant_id": site["tenant_id"],
                    "asset_type": site["asset_type"],
                    "active_power_output_kw": round(solar_available, 1),
                    "total_current_load_kw": round(load, 1),
                    "bess_state_of_charge_pct": round(soc, 1),
                    "battery_health_soh": site["initial_soh_pct"],
                    "grid_voltage_status": 1 if grid_online else 0,
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
                    "pv_yield_kw": round(solar_available, 1),
                    "consumption_ac_load_kw": round(load, 1),
                    "soc_percentage": round(soc, 1),
                    "battery_health_pct": site["initial_soh_pct"],
                    "grid_state": "connected" if grid_online else "alarm_active",
                    "kplc_cost_per_kwh": tariff,
                }
            }

        return {
            "sungrow_data": {
                "tenant_id": site["tenant_id"],
                "asset_type": site["asset_type"],
                "station_code": site["id"],
                "sync_date": now.strftime("%Y-%m-%d %H:%M:%S"),
                "array_power_kw": round(solar_available, 1),
                "load_power_kw": round(load, 1),
                "bess_cap_left_pct": round(soc, 1),
                "state_of_health": site["initial_soh_pct"],
                "grid_relay_closed": grid_online,
                "billing_rate_kes": tariff,
            }
        }


SIMULATOR = TelemetrySimulator(
    seed=os.getenv("VUMAGRID_SIMULATION_SEED", "42"),
    scenario=os.getenv("VUMAGRID_SIMULATION_SCENARIO", "normal"),
)


def generate_telemetry(site):
    """Generate synthetic readings inside vendor-shaped payload envelopes."""
    return SIMULATOR.generate_telemetry(site)


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
                    headers = {"X-VumaGrid-Simulation": "true"}
                    if device_token:
                        headers["Authorization"] = f"Bearer {device_token}"
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
