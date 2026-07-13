from datetime import datetime

from pydantic import BaseModel


class UnifiedTelemetry(BaseModel):
    """The single standardized layout that VumaGrid's backend will use for all math and AI."""

    site_id: str
    brand: str
    timestamp: datetime
    solar_generation_kw: float
    facility_load_kw: float
    battery_soc_pct: float
    battery_soh_pct: float
    grid_online: bool
    current_tariff_kes: float

    # Calculated helper to create the Energy Health Score later
    def calculate_health_penalty(self) -> float:
        penalty = 0.0
        if self.battery_soh_pct < 85.0:
            penalty += (85.0 - self.battery_soh_pct) * 2
        if not self.grid_online and self.battery_soc_pct < 20.0:
            penalty += 15.0
        return min(penalty, 100.0)
