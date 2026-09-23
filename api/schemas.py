import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# --- Simulation Schemas ---

class SimulationUncertaintyConfig(BaseModel):
    wind_uncertainty_mps: float = Field(default=1.5, ge=0.0)
    angle_uncertainty_deg: float = Field(default=0.1, ge=0.0)
    muzzle_velocity_uncertainty_mps: float = Field(default=2.0, ge=0.0)
    gnss_noise_m: float = Field(default=4.0, ge=0.0)
    ins_drift_mps: float = Field(default=0.05, ge=0.0)
    actuator_noise_deg: float = Field(default=0.1, ge=0.0)
    sensor_noise_m: float = Field(default=0.5, ge=0.0)
    timing_jitter_ms: float = Field(default=2.0, ge=0.0)
    is_active: bool = Field(default=True)

class Provenance(BaseModel):
    value: Any
    source: str
    status: str
    model_version: str
    config_version: str
    timestamp: datetime.datetime

class SimulationConfig(BaseModel):
    is_pgk_enabled: bool = True
    target_distance: float = Field(default=24000.0, gt=0)
    launch_elevation_deg: float = Field(default=45.0, ge=0.0, le=90.0)
    wind_speed_x: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_speed_z: float = Field(default=0.0, ge=-100.0, le=100.0)
    latitude_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    firing_azimuth_deg: float = Field(default=0.0, ge=0.0, le=360.0)
    is_wind_shear_enabled: bool = False
    wind_low_x: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_med_x: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_high_x: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_low_z: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_med_z: float = Field(default=0.0, ge=-100.0, le=100.0)
    wind_high_z: float = Field(default=0.0, ge=-100.0, le=100.0)
    fuze_mode: Literal["PROXIMITY", "TIME", "IMPACT", "DELAY"] = "PROXIMITY"
    fuze_delay_ms: float = Field(default=0.0, ge=0.0)
    navigation_mode: Literal["NORMAL", "DEGRADED", "DENIED"] = "NORMAL"
    proximity_height: float = Field(default=12.0, ge=0.0)
    programmed_flight_time: float = Field(default=60.0, ge=0.0)
    uncertainty: SimulationUncertaintyConfig = Field(default_factory=SimulationUncertaintyConfig)
    random_seed: int | None = Field(default=None, description="RNG seed for reproducibility. None = non-deterministic.")

class MonteCarloParams(SimulationConfig):
    runs: int = Field(default=100, ge=10, le=10000)
    random_seed: int = Field(default=42)  # MC always requires an explicit seed

# --- Telemetry & Navigation Schemas ---

class TelemetryPacket(BaseModel):
    session_id: str = Field(..., description="Must match a created telemetry session")
    timestamp: datetime.datetime
    accelerometer: list[float] = Field(..., max_length=3, min_length=3)
    gyroscope: list[float] = Field(..., max_length=3, min_length=3)
    temperature: float
    voltage: float
    current: float
    device_state: str
    sequence_number: int
    checksum: str

class NavigationStatus(BaseModel):
    gnss_lock: bool
    satellites_visible: int
    hdop: float
    ins_status: str

# --- Hardware Schemas ---

class FuzeConfig(BaseModel):
    mode: Literal["PROXIMITY", "TIME", "IMPACT", "DELAY"]
    delay_ms: float
    height_of_burst: float

class HardwareEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: datetime.datetime
    details: dict
    source_type: Literal["SIMULATED", "BENCH_MEASURED", "HARDWARE_MEASURED"] = Field(default="SIMULATED", description="P3 Hardware logging source")

# --- Manufacturing & Assets Schemas ---

class Component(BaseModel):
    part_number: str
    name: str
    revision: str
    status: str

class Document(BaseModel):
    doc_id: str
    title: str
    version: str
    url: str

class FaultInjectionRequest(BaseModel):
    fault_type: str = Field(..., description="The type of fault to inject (e.g. GNSS_LOSS, SENSOR_BIAS)")

class FaultInjectionResponse(BaseModel):
    fault_injected: str
    detection: str
    system_response: str
    recovery_mode: str
    logged_event: str

class Report(BaseModel):
    report_id: str
    generated_at: datetime.datetime
    report_type: str
