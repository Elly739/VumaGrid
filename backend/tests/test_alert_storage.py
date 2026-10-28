import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app import storage


class AlertStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_directory.name) / "test.db"
        self.database_patch = patch.object(storage, "DB_PATH", self.database_path)
        self.database_patch.start()
        self.timestamp = datetime(2026, 6, 1, 9, tzinfo=timezone.utc)
        self.alert = {
            "type": "BATTERY_DEGRADATION",
            "severity": "WARNING",
            "message": "Battery health is below the preferred threshold.",
        }

    def tearDown(self):
        self.database_patch.stop()
        self.temp_directory.cleanup()

    def test_alert_updates_acknowledges_resolves_and_reopens(self):
        self.assertEqual(
            storage.sync_site_alerts("tenant-a", "site-a", [self.alert], self.timestamp),
            ["BATTERY_DEGRADATION"],
        )
        first = storage.load_active_alerts(["tenant-a"])[0]
        self.assertIsNone(first["acknowledged_at"])

        self.assertEqual(
            storage.sync_site_alerts("tenant-a", "site-a", [self.alert], self.timestamp + timedelta(seconds=5)),
            [],
        )
        self.assertEqual(len(storage.load_active_alerts(["tenant-a"])), 1)
        self.assertTrue(storage.acknowledge_alert(first["id"])["acknowledged_at"])

        self.assertEqual(storage.sync_site_alerts("tenant-a", "site-a", [], self.timestamp + timedelta(seconds=10)), [])
        self.assertEqual(storage.load_active_alerts(["tenant-a"]), [])
        self.assertEqual(
            storage.sync_site_alerts("tenant-a", "site-a", [self.alert], self.timestamp + timedelta(seconds=15)),
            ["BATTERY_DEGRADATION"],
        )
        reopened = storage.load_active_alerts(["tenant-a"])[0]
        self.assertNotEqual(reopened["id"], first["id"])
        self.assertIsNone(reopened["acknowledged_at"])

    def test_active_alerts_are_filtered_to_requested_tenants(self):
        storage.sync_site_alerts("tenant-a", "site-a", [self.alert], self.timestamp)
        storage.sync_site_alerts("tenant-b", "site-b", [self.alert], self.timestamp)

        self.assertEqual([item["tenant_id"] for item in storage.load_active_alerts(["tenant-a"])], ["tenant-a"])
        self.assertEqual(storage.load_active_alerts([]), [])


if __name__ == "__main__":
    unittest.main()