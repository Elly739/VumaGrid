from datetime import datetime

from pydantic import BaseModel, Field


class UnifiedTelemetry(BaseModel):
    """Production Multi-Tenant unified layout mapping isolated customer bounds."""
    tenant_id: str = Field(min_length=1, max_length=128)
    site_id: str = Field(min_length=1, max_length=128)
    asset_type: str = Field(min_length=1, max_length=64)
    brand: str = Field(min_length=1, max_length=64)
    timestamp: datetime
    solar_generation_kw: float = Field(ge=0)
    facility_load_kw: float = Field(ge=0)
    battery_soc_pct: float = Field(ge=0, le=100)
    battery_soh_pct: float = Field(ge=0, le=100)
    grid_online: bool
    current_tariff_kes: float = Field(ge=0)
    grid_import_kw: float = Field(default=0.0, ge=0)
    battery_charge_kw: float = Field(default=0.0, ge=0)
    battery_discharge_kw: float = Field(default=0.0, ge=0)
    solar_curtailed_kw: float = Field(default=0.0, ge=0)
    unserved_load_kw: float = Field(default=0.0, ge=0)
    ev_charger_kw: float = Field(default=0.0, ge=0)
    heat_pump_kw: float = Field(default=0.0, ge=0)
    other_load_kw: float = Field(default=0.0, ge=0)
    power_flow_source: str = Field(default="unavailable", max_length=24)
    load_breakdown_source: str = Field(default="unavailable", max_length=24)

    def calculate_health_penalty(self) -> float:
        penalty = 0.0
        if self.battery_soh_pct < 85.0:
            penalty += (85.0 - self.battery_soh_pct) * 2
        if not self.grid_online and self.battery_soc_pct < 20.0:
            penalty += 15.0
        return min(penalty, 100.0)
