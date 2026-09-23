from pydantic import BaseModel

from version import PHYSICS_VERSION


class SimulationConfig(BaseModel):
    model_version: str = PHYSICS_VERSION
    integration_step_s: float = 0.01
    atmospheric_model: str = "1976 Standard Atmosphere"
    drag_model: str = "Mach-dependent point-mass"
    
    # Core physics constants
    nominal_mass_kg: float = 43.5
    nominal_diameter_m: float = 0.155
    nominal_muzzle_velocity_mps: float = 827.0
    
SIMULATION_CONFIG = SimulationConfig()
