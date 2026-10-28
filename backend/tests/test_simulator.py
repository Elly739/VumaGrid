import copy
import unittest
from datetime import datetime, timedelta, timezone

from simulator import SITES, TelemetrySimulator


class TelemetrySimulatorTests(unittest.TestCase):
    def test_seeded_runs_are_reproducible(self):
        first = TelemetrySimulator(seed=73, profiles=copy.deepcopy(SITES))
        second = TelemetrySimulator(seed=73, profiles=copy.deepcopy(SITES))
        start = datetime(2026, 6, 1, 9, tzinfo=timezone.utc)

        for offset in range(10):
            timestamp = start + timedelta(seconds=5 * offset)
            self.assertEqual(
                first.generate_telemetry(first.profiles[0], timestamp),
                second.generate_telemetry(second.profiles[0], timestamp),
            )

    def test_power_balance_and_battery_bounds_hold(self):
        simulator = TelemetrySimulator(seed=11, profiles=copy.deepcopy(SITES))
        start = datetime(2026, 6, 1, 9, tzinfo=timezone.utc)

        for offset in range(500):
            timestamp = start + timedelta(seconds=5 * offset)
            for site in simulator.profiles:
                simulator.generate_telemetry(site, timestamp)
                flow = simulator.last_power_flow[site["id"]]
                balance_error = (
                    flow["solar_kw"] + flow["grid_draw_kw"] + flow["battery_discharge_kw"]
                    - (flow["load_kw"] - flow["unserved_load_kw"]
                       + flow["battery_charge_kw"] + flow["curtailed_solar_kw"])
                )
                self.assertAlmostEqual(balance_error, 0.0, places=6)
                stored_energy = simulator.states[site["id"]]["stored_energy_kwh"]
                self.assertGreaterEqual(stored_energy, site["bess_capacity_kwh"] * 0.15)
                self.assertLessEqual(stored_energy, site["bess_capacity_kwh"])

    def test_grid_outage_scenario_recovers_after_30_minutes(self):
        simulator = TelemetrySimulator(seed=9, scenario="grid_outage", profiles=copy.deepcopy(SITES))
        site = next(site for site in simulator.profiles if site["id"] == "VUMA-NKR-FARM")
        start = datetime(2026, 6, 1, 9, tzinfo=timezone.utc)

        for offset in range(360):
            simulator.generate_telemetry(site, start + timedelta(seconds=5 * offset))
            self.assertFalse(simulator.last_power_flow[site["id"]]["grid_online"])

        simulator.generate_telemetry(site, start + timedelta(seconds=1800))
        self.assertTrue(simulator.last_power_flow[site["id"]]["grid_online"])

    def test_health_is_stable_and_vendor_shapes_are_preserved(self):
        simulator = TelemetrySimulator(seed=2, profiles=copy.deepcopy(SITES))
        timestamp = datetime(2026, 6, 1, 9, tzinfo=timezone.utc)
        expected_keys = ("metadata", "victron_venus_payload", "sungrow_data")

        for site, key in zip(simulator.profiles, expected_keys):
            payload = simulator.generate_telemetry(site, timestamp)
            self.assertIn(key, payload)
            registers = payload.get("registers", payload.get(key))
            health_key = {
                "metadata": "battery_health_soh",
                "victron_venus_payload": "battery_health_pct",
                "sungrow_data": "state_of_health",
            }[key]
            self.assertEqual(registers[health_key], site["initial_soh_pct"])


if __name__ == "__main__":
    unittest.main()