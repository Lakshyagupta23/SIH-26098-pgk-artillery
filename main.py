import os

from dotenv import load_dotenv

load_dotenv()
import subprocess
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import models

# Import database and models
from database import SessionLocal, get_db


def _run_migrations():
    print("[SCHEMA MIGRATION] Running Alembic migrations...")
    try:
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
        print("[SCHEMA MIGRATION] Complete.")
    except subprocess.CalledProcessError as e:
        print(f"[SCHEMA MIGRATION] Failed: {e}")
        sys.exit(1)

_run_migrations()


# Import our Python physics engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    with next(get_db()) as db:
        seed_database(db)
        
        # P2-10: Demo Authentication Guard
        if os.getenv("DEMO_MODE", "False").lower() == "true":
            print("[SECURITY] DEMO MODE ENABLED: Checking for demo admin user...")
            from api.security import _IS_PRODUCTION
            if _IS_PRODUCTION:
                raise RuntimeError("DEMO_MODE=true is not allowed in production. Remove DEMO_MODE environment variable.")
            
            admin_pwd = os.getenv("DEMO_ADMIN_PASSWORD")
            if not admin_pwd:
                raise RuntimeError("DEMO_MODE=true requires DEMO_ADMIN_PASSWORD to be set in the environment.")
                
            admin_user = db.query(models.User).filter(models.User.username == "admin").first()
            if not admin_user:
                from api.security import get_password_hash
                admin_user = models.User(
                    username="admin",
                    hashed_password=get_password_hash(admin_pwd),
                    role="ADMIN",
                    is_active=True
                )
                db.add(admin_user)
                db.commit()
                print("[SECURITY] Created demo admin user.")
        else:
            print("[SECURITY] Demo Mode disabled. No default credentials generated.")
        
        # Ensure offline settings exist
        settings = db.query(models.Project).filter(models.Project.name == "SystemSettings").first()
        if not settings:
            settings = models.Project(name="SystemSettings", description="OFFLINE_MODE_ACTIVE")
            db.add(settings)
            db.commit()
    yield

app = FastAPI(title="Aegis-155 Python Backend", lifespan=lifespan)
# P2-09: Fix CORS
cors_env = os.getenv("CORS_ORIGINS", "http://localhost:8000")
origins = [origin.strip() for origin in cors_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    # Process the request
    response = await call_next(request)
    
    # Log mutating actions
    if request.method in ["POST", "PUT", "DELETE"]:
        db = SessionLocal()
        try:
            # Simple audit log entry
            path = request.url.path
            action = f"{request.method} {path}"
            log_entry = models.AuditLog(
                actor="SYSTEM",
                action=action,
                entity_type="API_ROUTE",
                entity_id=path,
                details=f"Status Code: {response.status_code}"
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            import logging
            logging.error(f"Failed to log audit event: {e}", exc_info=True)
        finally:
            db.close()
            
    return response

from api.routers import (
    analysis,
    assets,
    auth,
    faults,
    hardware,
    hardware_config,
    jobs,
    manufacturing,
    power,
    simulation,
    system,
    system_version,
    telemetry,
    testing,
)
from api.security import get_current_active_user

# Register all modular routers
app.include_router(auth.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(simulation.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(hardware.router, prefix="/api")
app.include_router(testing.router, prefix="/api")
app.include_router(manufacturing.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(hardware_config.router)
app.include_router(faults.router, prefix="/api")
app.include_router(system_version.router, prefix="/api/version")
app.include_router(analysis.router, prefix="/api")
app.include_router(power.router, prefix="/api")

# === Phase 6: Database Persistence & Seeding ===
def seed_database(db: Session):
    # Seed System Versions
    if db.query(models.SystemVersion).first() is None:
        print("Seeding System Versions...")
        import version
        ver = models.SystemVersion(
            frontend_version=version.FRONTEND_VERSION,
            backend_version=version.BACKEND_VERSION,
            physics_version=version.PHYSICS_VERSION,
            config_version=version.CONFIG_VERSION,
            hardware_revision=version.HARDWARE_REVISION,
            cad_revision=version.CAD_REVISION
        )
        db.add(ver)
        db.commit()

    # Seed BOM
    if db.query(models.BomItem).first() is None:
        print("Seeding BOM from BOM_CONFIG...")
        from config.bom_config import BOM_CONFIG
        for b_data in BOM_CONFIG.components:
            db.add(models.BomItem(**b_data.model_dump()))
        db.commit()

    # Seed Power
    if db.query(models.PowerSubsystem).first() is None:
        print("Seeding Power Budget from POWER_CONFIG...")
        from config.power_config import POWER_CONFIG
        for p_data in POWER_CONFIG.subsystems:
            db.add(models.PowerSubsystem(**p_data.model_dump()))
        db.commit()

    # Seed Tests
    if db.query(models.TestRun).first() is None:
        print("Seeding Test Runs...")
        tests = [
            {
                "test_id": "SIM-001", "date": "2026-09-20", "objective": "Baseline CEP — Ideal Conditions (No wind, No uncertainty)",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "ISA Std, 0 Wind, 0.0 MV unc, 15km, 45°", "expected": "CEP50 < 10m", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Ideal conditions simulation. No external disturbances.", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-002", "date": "2026-09-20", "objective": "Operational CEP — Standard Met Conditions (Wind + uncertainty active)",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "5m/s wind, σ_angle=0.1°, σ_mv=2m/s, σ_gnss=4m, 15km", "expected": "CEP50 < 30m", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Primary CEP simulation run for REQ-024.", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-003", "date": "2026-09-21", "objective": "GNSS-Denied Navigation — INS Dead-Reckoning Mode",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "Navigation=DENIED, INS drift=0.05m/s, 15km", "expected": "CEP50 < 80m (graceful degradation)", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Demonstrates graceful degradation to INS-only mode under GPS jamming.", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-004", "date": "2026-09-21", "objective": "Fuze Mode Simulation — Proximity (AIRBURST)",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "PROXIMITY mode, HoB=12m, 15km", "expected": "Detonation 10-15m above ground", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] FMCW radar proximity fuze simulation (SIL).", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-005", "date": "2026-09-21", "objective": "Fuze Mode Simulation — Time (DELAY)",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "TIME mode, PFT=47.2s, 15km", "expected": "Detonation at T=47.2s ± 10ms", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Programmed Flight Time fuze event simulated (SIL).", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-006", "date": "2026-09-21", "objective": "Coriolis Effect Simulation — 15km at 21.5°N latitude",
                "model_version": version.PHYSICS_VERSION, "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "Lat=21.5°N, Az=45°, 15km, No wind", "expected": "Measurable Z-deflection due to Coriolis", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Coriolis acceleration applied correctly via 3D cross-product.", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "SIM-007", "date": "2026-09-22", "objective": "ESAD State Machine — Setback→Spin→Armed Sequence",
                "model_version": "N/A", "software_version": version.SYSTEM_VERSION, "hardware_version": "SIMULATED",
                "config": "ESAD software sim, g_axial=18450g, spin=260Hz", "expected": "ARMED after 1.5s spin confirmation", "observed": "AWAITING_EXECUTION",
                "status": "SIMULATED", "notes": "[DEMO SEED] Full ESAD arming sequence simulated in software (SIL).", "source_type": "SIMULATION", "evidence": "Requires active simulation run"
            },
            {
                "test_id": "HW-001", "date": "2026-09-22", "objective": "Benchtop IMU Telemetry Pipeline — MCU→Gateway→Dashboard",
                "model_version": "N/A", "software_version": version.SYSTEM_VERSION, "hardware_version": version.HARDWARE_REVISION,
                "config": "STM32+MPU6050 @ 100Hz, USB serial", "expected": "Real-time telemetry visible in dashboard", "observed": "Demonstrated at 92Hz avg",
                "status": "SIMULATED", "notes": "[DEMO SEED] Inert hardware demonstrator. Software-commanded bench test only. No energetic components. No in-flight conditions simulated. Does NOT constitute physical HIL validation.", "source_type": "SIMULATION", "evidence": "Live dashboard screenshot (SIL telemetry demo)"
            },
            {
                "test_id": "HW-002", "date": "N/A", "objective": "High-G Survivability — Setback Shock (18,450g)",
                "model_version": "N/A", "software_version": "N/A", "hardware_version": version.HARDWARE_REVISION,
                "config": "Air-gun shock tube, 18450g, 1ms duration", "expected": "No mechanical failure, normal MCU boot", "observed": "PENDING",
                "status": "PENDING", "notes": "[DEMO SEED] Physical validation test required. Not yet performed.", "source_type": "DESIGN_ESTIMATE", "evidence": "N/A"
            },
            {
                "test_id": "HW-003", "date": "N/A", "objective": "Spin Environment Survivability — 260 Hz shell body rotation",
                "model_version": "N/A", "software_version": "N/A", "hardware_version": version.HARDWARE_REVISION,
                "config": "Spin rig, 260Hz, 60s duration", "expected": "Despin bearing maintains < 5RPM nose relative to ground", "observed": "PENDING",
                "status": "PENDING", "notes": "[DEMO SEED] Despin bearing mechanism requires physical test.", "source_type": "DESIGN_ESTIMATE", "evidence": "N/A"
            },
        ]
        for t_data in tests:
            db.add(models.TestRun(**t_data))
        db.commit()

    # Seed Requirements
    if db.query(models.Requirement).first() is None:
        print("Seeding Requirements (23 SRD requirements)...")
        reqs = [
            {"req_id": "REQ-001", "name": "System architecture",           "description": "Drop-in compatibility with NATO standard projectile body. [PROPOSED ENGINEERING TARGET — not explicitly specified in YIL PS]", "threshold": "[INTERNAL DESIGN ASSUMPTION] M8 thread, 51mm dia fuze well", "verification_method": "INSPECTION",    "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-002", "name": "Existing platform compatibility","description": "Launchable from standard M777, M109A6 howitzers. [PROPOSED ENGINEERING TARGET]", "threshold": "[INTERNAL DESIGN ASSUMPTION] ≥3 platform types compatible", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-003", "name": "Canard actuation",              "description": "CAA provides 2D aerodynamic steering via 4 canard fins.", "threshold": "4 fins, ±15° deflection", "verification_method": "DEMONSTRATION",  "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-004", "name": "Guidance",                      "description": "Proportional Navigation guidance law to null miss distance.", "threshold": "Miss distance → 0", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-005", "name": "Navigation",                    "description": "Tightly-coupled GNSS/INS hybrid with EKF.", "threshold": "Nav update rate ≥ 10 Hz", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-006", "name": "Control algorithm",             "description": "Loop completes correction cycle within servo bandwidth.", "threshold": "Loop rate ≥ 25 Hz", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-007", "name": "Proximity event logic",         "description": "Airburst mode triggered by 24.15 GHz-class FMCW proximity-sensing demonstrator altitude measurement.", "threshold": "Trigger at 10-15m HoB", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-008", "name": "Time event logic",              "description": "Airburst mode triggered by programmable flight timer.", "threshold": "Timer accuracy < 10ms", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-009", "name": "Impact event logic",            "description": "Point detonation on surface impact.", "threshold": "Instantaneous piezoelectric response", "verification_method": "ANALYSIS",   "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-010", "name": "Embedded electronics",          "description": "GEU based on radiation-tolerant MCU.", "threshold": "Temp: -40°C to +125°C", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-011", "name": "Programming interface",         "description": "Fuze programmable via inductive setter.", "threshold": "Programming time < 5s", "verification_method": "DEMONSTRATION",  "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-012", "name": "Power management",              "description": "Setback-activated thermal reserve battery.", "threshold": "Flight duration ≤ 90s, < 5W peak", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-013", "name": "High-G environment",            "description": "Survive muzzle exit setback force.", "threshold": "18,450g axial, 1ms duration", "verification_method": "DEMONSTRATION",  "status": "PENDING"},
            {"req_id": "REQ-014", "name": "Vibration environment",         "description": "Survive in-bore and free-flight vibration.", "threshold": "MIL-STD-810 Method 514.8", "verification_method": "DEMONSTRATION",  "status": "PENDING"},
            {"req_id": "REQ-015", "name": "Spin environment",              "description": "Nose assembly despins from shell body. [INTERNAL PROJECT OBJECTIVE — spin rate is reference simulation parameter, not official YIL PS value]", "threshold": "[INTERNAL DESIGN ASSUMPTION] Nose < 5 RPM when body at ~15,000 RPM (reference)", "verification_method": "DEMONSTRATION",  "status": "PENDING"},
            {"req_id": "REQ-016", "name": "Thermal/environmental robustness","description": "Operate across military environmental range.", "threshold": "Operating: -40°C to +71°C", "verification_method": "DEMONSTRATION",  "status": "PENDING"},
            {"req_id": "REQ-017", "name": "SWaP-C",                        "description": "Fit within NATO 2-inch fuze form factor.", "threshold": "≤ 57mm OD, ≤ 200mm length", "verification_method": "INSPECTION",    "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-018", "name": "Safety",                        "description": "ESAD arms only after setback AND spin.", "threshold": "SAFE → SETBACK → SPIN → ARMED", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-019", "name": "Reliability",                   "description": "Single-shot reliability for engagement. [PROPOSED ENGINEERING TARGET — not explicitly specified in YIL PS]", "threshold": "[INTERNAL PROJECT OBJECTIVE] Pr(Success) ≥ 0.90", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-020", "name": "Modularity",                    "description": "PGK and fuze as separable modules.", "threshold": "2 assemblies: GEU + Fuze", "verification_method": "INSPECTION",    "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-021", "name": "Manufacturability",             "description": "Standard industrial base sourcing. [PROPOSED ENGINEERING TARGET]", "threshold": "[INTERNAL PROJECT OBJECTIVE] ≥80% MSME-sourceable", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
            {"req_id": "REQ-022", "name": "Simulation",                    "description": "3D flight dynamics include drag, Magnus, Coriolis, etc. Flight dynamics model implemented and verified through software regression tests; external reference validation pending.", "threshold": "≥5 physical effects modelled", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-023", "name": "Validation",                    "description": "Test plan for high-G, vibration, spin. Software-in-the-loop demonstrated; physical validation pending.", "threshold": "Test plan document complete", "verification_method": "INSPECTION",    "status": "PENDING"},
            {"req_id": "REQ-024", "name": "CEP objective",                 "description": "Guided projectile CEP50 ≤ 30m at 15km reference evaluation scenario.", "threshold": "CEP50 ≤ 30m at 15km reference evaluation scenario", "verification_method": "SIMULATION",   "status": "SIMULATED"},
            {"req_id": "REQ-025", "name": "Future upgradeability",         "description": "Support firmware updates to guidance laws.", "threshold": "OTA-capable or reprogrammable", "verification_method": "ANALYSIS",     "status": "DESIGN ESTIMATE"},
        ]
        
        evidence_map = {
            "REQ-001": [("DR-001", "ANALYSIS")],
            "REQ-002": [("DR-002", "ANALYSIS")],
            "REQ-003": [("SIM-007", "SIMULATION")],  # CAA modelled in simulation — no physical bench test performed
            "REQ-004": [("SIM-001", "SIMULATION"), ("SIM-002", "SIMULATION")],
            "REQ-005": [("SIM-003", "SIMULATION")],
            "REQ-006": [("SIM-002", "SIMULATION")],
            "REQ-007": [("SIM-004", "SIMULATION")],
            "REQ-008": [("SIM-005", "SIMULATION")],
            "REQ-009": [("DR-009", "ANALYSIS")],
            "REQ-010": [("DR-010", "ANALYSIS")],
            "REQ-011": [("DR-011", "ANALYSIS")],
            "REQ-012": [("DR-012", "ANALYSIS")],
            "REQ-013": [("HW-002", "DESIGN_ESTIMATE")],
            "REQ-014": [("HW-VIB", "DESIGN_ESTIMATE")],
            "REQ-015": [("HW-003", "DESIGN_ESTIMATE")],
            "REQ-016": [("HW-THERM", "DESIGN_ESTIMATE")],
            "REQ-017": [("DR-017", "ANALYSIS")],
            "REQ-018": [("SIM-007", "SIMULATION")],
            "REQ-019": [("DR-019", "ANALYSIS")],
            "REQ-020": [("DR-020", "ANALYSIS")],
            "REQ-021": [("DR-021", "ANALYSIS")],
            "REQ-022": [("SIM-006", "SIMULATION")],
            "REQ-023": [("TESTPLAN-01", "INSPECTION")],
            "REQ-024": [("SIM-002", "SIMULATION")],
            "REQ-025": [("DR-025", "ANALYSIS")],
        }

        for r_data in reqs:
            req = models.Requirement(**r_data)
            db.add(req)
            db.flush()
            if req.req_id in evidence_map:
                for ref_id, src_type in evidence_map[req.req_id]:
                    ev = models.RequirementEvidence(
                        requirement_id=req.id, reference_id=ref_id,
                        source_type=src_type, evidence_status="NOT_VALIDATED"
                    )
                    db.add(ev)
        
        db.commit()

# End of seed_database function
# Note: Only one canonical seed block exists above.
# Legacy duplicate seed blocks have been removed to prevent data inconsistency.

# Lifespan handles the startup events now



# === Phase 21: Offline-First — Mount vendor libraries ===
# /vendor/ must be mounted BEFORE the root "/" to take precedence
vendor_dir = os.path.join(os.path.dirname(__file__), "static", "vendor")
app.mount("/vendor", StaticFiles(directory=vendor_dir), name="vendor")

# Mount the static frontend
# Note: Ensure that index.html is directly inside the static/ folder
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

