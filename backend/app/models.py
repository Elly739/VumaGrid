from datetime import datetime

from pydantic import BaseModel


class UnifiedTelemetry(BaseModel):
    """Production Multi-Tenant unified layout mapping isolated customer bounds."""
    tenant_id: str
    site_id: str
    asset_type: str
    brand: str
    timestamp: datetime
    solar_generation_kw: float
    facility_load_kw: float
    battery_soc_pct: float
    battery_soh_pct: float
    grid_online: bool
    current_tariff_kes: float

    def calculate_health_penalty(self) -> float:
        penalty = 0.0
        if self.battery_soh_pct < 85.0:
            penalty += (85.0 - self.battery_soh_pct) * 2
        if not self.grid_online and self.battery_soc_pct < 20.0:
            penalty += 15.0
        return min(penalty, 100.0)
