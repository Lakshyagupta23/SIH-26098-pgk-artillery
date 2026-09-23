
from pydantic import BaseModel


class PowerSubsystemItem(BaseModel):
    name: str
    nominal_power_mw: float
    peak_power_mw: float
    duty_cycle_pct: float
    energy_mj: float
    conversion_efficiency: float
    source: str = "DESIGN ESTIMATE"
    evidence_status: str = "SIMULATED"

class PowerConfig(BaseModel):
    title: str = "PRELIMINARY CONCEPT POWER BUDGET"
    subsystems: list[PowerSubsystemItem] = [
        PowerSubsystemItem(name="Avionics (Flight Computer)", nominal_power_mw=450.0, peak_power_mw=850.0, duty_cycle_pct=100.0, energy_mj=27000.0, conversion_efficiency=0.85),
        PowerSubsystemItem(name="Navigation (IMU + GNSS)", nominal_power_mw=1900.0, peak_power_mw=2700.0, duty_cycle_pct=100.0, energy_mj=114000.0, conversion_efficiency=0.85),
        PowerSubsystemItem(name="Sensor (FMCW Radar)", nominal_power_mw=600.0, peak_power_mw=1100.0, duty_cycle_pct=30.0, energy_mj=10800.0, conversion_efficiency=0.85),
        PowerSubsystemItem(name="Actuation (4x Canard Servos)", nominal_power_mw=1200.0, peak_power_mw=3000.0, duty_cycle_pct=25.0, energy_mj=18000.0, conversion_efficiency=0.80),
        PowerSubsystemItem(name="Ordnance (ESAD)", nominal_power_mw=150.0, peak_power_mw=450.0, duty_cycle_pct=100.0, energy_mj=9000.0, conversion_efficiency=0.90)
    ]
    
POWER_CONFIG = PowerConfig()
