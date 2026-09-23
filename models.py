import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    role = Column(String, default="VIEWER/JUDGE")
    is_active = Column(Boolean, default=True)
class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)

class Requirement(Base):
    __tablename__ = "requirements"
    id = Column(Integer, primary_key=True, index=True)
    req_id = Column(String, unique=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    threshold = Column(String, nullable=True)         # e.g. "CEP ≤ 30m at 15km"
    verification_method = Column(String, nullable=True)  # SIMULATION | ANALYSIS | INSPECTION | DEMONSTRATION
    status = Column(String)
    
    evidence = relationship("RequirementEvidence", back_populates="requirement")

class RequirementEvidence(Base):
    __tablename__ = "requirement_evidence"
    id = Column(Integer, primary_key=True, index=True)
    requirement_id = Column(Integer, ForeignKey("requirements.id"))
    reference_id = Column(String)  # Replaces document_id with run_id, test_id, or doc_id
    source_type = Column(String, default="SIMULATION") # SIMULATION, DESIGN_ESTIMATE, BENCH_MEASURED, HARDWARE_MEASURED
    evidence_status = Column(String, default="NOT_VALIDATED") # VALIDATED, NOT_VALIDATED, DEMO_DATA
    
    requirement = relationship("Requirement", back_populates="evidence")

class SimulationJob(Base):
    __tablename__ = "simulation_jobs"
    job_id = Column(String, primary_key=True, index=True)
    status = Column(String)  # QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED
    progress = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    random_seed = Column(Integer)
    frontend_version = Column(String, nullable=True)
    backend_version = Column(String, nullable=True)
    physics_version = Column(String, nullable=True)
    hardware_revision = Column(String, nullable=True)
    cad_revision = Column(String, nullable=True)
    config_hash = Column(String, nullable=True)
    result_hash = Column(String, nullable=True)
    result_data = Column(String, nullable=True)
    # Stores full serialized MonteCarloParams JSON at job creation time.
    # Enables true Replay Run: fetch snapshot → resubmit identical parameters.
    configuration_snapshot = Column(String, nullable=True)
    error_message = Column(String, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor = Column(String, nullable=True, default="SYSTEM")
    action = Column(String, index=True)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    resource = Column(String, index=True, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    details = Column(String, nullable=True)
    result_data = Column(String, nullable=True)  # JSON string of results if completed
    error_message = Column(String, nullable=True)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, unique=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    model_version = Column(String)
    configuration_version = Column(String)

class SimulationParameter(Base):
    __tablename__ = "simulation_parameters"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("simulation_runs.id"))
    key = Column(String)
    value = Column(Float)

class SimulationResult(Base):
    __tablename__ = "simulation_results"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("simulation_runs.id"))
    cep50 = Column(Float)
    impact_x = Column(Float)
    impact_y = Column(Float)

class TelemetrySession(Base):
    __tablename__ = "telemetry_sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    device_id = Column(String, nullable=True)
    mode = Column(String, nullable=True)
    software_version = Column(String, nullable=True)
    is_simulated = Column(Boolean, default=True)

class TelemetrySample(Base):
    __tablename__ = "telemetry_samples"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("telemetry_sessions.id"))
    timestamp_ms = Column(Integer)
    accel_x = Column(Float)
    accel_y = Column(Float)
    accel_z = Column(Float)
    gyro_x = Column(Float)
    gyro_y = Column(Float)
    gyro_z = Column(Float)
    temperature = Column(Float)
    voltage = Column(Float)
    current = Column(Float)
    device_state = Column(String)
    sequence_number = Column(Integer)
    checksum = Column(String)

class TestRun(Base):
    __tablename__ = "test_runs"
    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(String, unique=True, index=True)
    date = Column(String)
    objective = Column(String)
    model_version = Column(String)
    software_version = Column(String)
    hardware_version = Column(String)
    config = Column(String)
    expected = Column(String)
    observed = Column(String)
    status = Column(String)
    notes = Column(String)
    evidence = Column(String)
    source_type = Column(String, default="SIMULATION")

class TestResult(Base):
    __tablename__ = "test_results"
    id = Column(Integer, primary_key=True, index=True)
    test_run_id = Column(Integer, ForeignKey("test_runs.id"))
    metric_name = Column(String)
    metric_value = Column(Float)

class Component(Base):
    __tablename__ = "components"
    id = Column(Integer, primary_key=True, index=True)
    part_number = Column(String, unique=True, index=True)
    name = Column(String)
    supplier = Column(String, nullable=True)

class BomItem(Base):
    __tablename__ = "bom_items"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(String, index=True)  # E.g. BOM-001
    name = Column(String, default="")
    category = Column(String)
    representative_part = Column(String)
    supplier = Column(String, nullable=True, default="TBD")
    quantity = Column(Integer, default=1)
    unit_cost = Column(Float)
    mass_g = Column(Float)
    power_mw = Column(Float)
    source = Column(String, default="DESIGN ESTIMATE")
    confidence = Column(String, default="LOW")
    status = Column(String, default="ESTIMATED")
    alternative = Column(String, nullable=True)
    revision = Column(String, nullable=True)

class PowerSubsystem(Base):
    __tablename__ = "power_subsystems"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    nominal_power_mw = Column(Float)
    peak_power_mw = Column(Float)
    duty_cycle_pct = Column(Float)
    energy_mj = Column(Float)
    conversion_efficiency = Column(Float, default=1.0)
    margin_pct = Column(Float, default=20.0)
    source = Column(String, default="DESIGN ESTIMATE")
    evidence_status = Column(String, default="SIMULATED")

class CadModel(Base):
    __tablename__ = "cad_models"
    id = Column(Integer, primary_key=True, index=True)
    component_id = Column(Integer, ForeignKey("components.id"))
    file_path = Column(String)
    version = Column(String)

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, unique=True, index=True)
    title = Column(String)
    url = Column(String)

class SystemVersion(Base):
    __tablename__ = "system_versions"
    id = Column(Integer, primary_key=True, index=True)
    frontend_version = Column(String)
    backend_version = Column(String)
    physics_version = Column(String)
    config_version = Column(String)
    hardware_revision = Column(String)
    cad_revision = Column(String)
    release_date = Column(DateTime, default=datetime.datetime.utcnow)

class SystemEvent(Base):
    __tablename__ = "system_events"
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    details = Column(String, nullable=True)

