from pydantic import BaseModel, Field


class HardwareConfig(BaseModel):
    actuator_max_slew_rate_deg_s: float = Field(default=60.0, description="SIMULATION / DESIGN ASSUMPTION ONLY. Physical actuator validation pending.")
    actuator_max_deflection_deg: float = Field(default=15.0, description="SIMULATION / DESIGN ASSUMPTION ONLY.")
    nav_gain: float = Field(default=4.0, description="SIMULATION / DESIGN ASSUMPTION ONLY.")
    
    # Proximity sensing
    proximity_sensor_type: str = Field(default="FMCW_K_BAND_SIMULATION", description="SIMULATION / DEMONSTRATOR ASSUMPTION ONLY.")
    proximity_sensor_frequency_display: str = Field(default="24.15 GHz-class", description="SIMULATION / DEMONSTRATOR ASSUMPTION ONLY. Not a validated production sensor specification.")
    
    # High-G assumption
    high_g_survivability_target: float = Field(default=18450.0, description="DESIGN TARGET ONLY. Physical measurement: NOT AVAILABLE.")
    
HARDWARE_CONFIG = HardwareConfig()
