import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.security import accessible_tenants, require_ingestion_tenant, require_tenant_access


class TenantAccessTests(unittest.TestCase):
    def test_operator_token_is_limited_to_configured_tenants(self):
        environment = {
            "VUMAGRID_DEMO_MODE": "false",
            "VUMAGRID_ACCESS_TOKENS": json.dumps({"operator-a": ["tenant-a"]}),
        }
        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(accessible_tenants("Bearer operator-a"), {"tenant-a"})

    def test_operator_cannot_read_another_tenant(self):
        environment = {
            "VUMAGRID_DEMO_MODE": "false",
            "VUMAGRID_ACCESS_TOKENS": json.dumps({"operator-a": ["tenant-a"]}),
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(HTTPException) as raised:
                require_tenant_access("tenant-b", "Bearer operator-a")
        self.assertEqual(raised.exception.status_code, 403)

    def test_ingestion_token_cannot_write_for_another_tenant(self):
        environment = {
            "VUMAGRID_DEMO_MODE": "false",
            "VUMAGRID_INGESTION_TOKENS": json.dumps({"device-a": ["tenant-a"]}),
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(HTTPException) as raised:
                require_ingestion_tenant("tenant-b", "Bearer device-a")
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()