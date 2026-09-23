import datetime
import hashlib
import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

import models
import version
from api.schemas import MonteCarloParams
from config import get_canonical_config_snapshot
from database import get_db
from physics import BallisticsEngine
from version import (
    BACKEND_VERSION,
    CAD_REVISION,
    CONFIG_VERSION,
    FRONTEND_VERSION,
    HARDWARE_REVISION,
    PHYSICS_VERSION,
    SYSTEM_VERSION,
)

router = APIRouter(tags=["Jobs"])

# Active job cancellation and progress tracking (in-memory overlay for running jobs)
ACTIVE_JOBS: dict[str, dict] = {}

@router.post("/jobs", summary="Create Monte Carlo Job")
def create_job(params: MonteCarloParams, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    params_dict = params.model_dump()

    # === Complete canonical configuration snapshot ===
    # All engineering constants that define reproducibility are frozen here.
    # The snapshot is the authoritative record for replay and provenance.
    canonical_cfg = get_canonical_config_snapshot()
    snapshot_data = {
        "system_config": canonical_cfg["system"],
        "simulation_config": canonical_cfg["simulation"],
        "hardware_config": canonical_cfg["hardware"],
        "power_config": canonical_cfg["power"],
        "bom_config": canonical_cfg["bom"],
        "versions": {
            "system_version": SYSTEM_VERSION,
            "frontend_version": FRONTEND_VERSION,
            "backend_version": BACKEND_VERSION,
            "physics_version": PHYSICS_VERSION,
            "config_version": CONFIG_VERSION,
            "hardware_revision": HARDWARE_REVISION,
            "cad_revision": CAD_REVISION,
        },
        "model_version": PHYSICS_VERSION,
        "simulation_parameters": params_dict,
        "random_seed": params.random_seed,
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat()  # runtime only — excluded from hash
    }

    # === Deterministic config_hash ===
    # Covers the complete canonical snapshot excluding the runtime timestamp.
    # Same canonical config + same simulation params + same seed → same config_hash.
    hash_data = {k: v for k, v in snapshot_data.items() if k != "timestamp"}
    config_hash = hashlib.sha256(json.dumps(hash_data, sort_keys=True).encode('utf-8')).hexdigest()

    configuration_snapshot = json.dumps(snapshot_data, sort_keys=True)
    
    job_record = models.SimulationJob(
        job_id=job_id,
        status="QUEUED",
        progress=0.0,
        random_seed=params.random_seed,
        frontend_version=FRONTEND_VERSION,
        backend_version=BACKEND_VERSION,
        physics_version=PHYSICS_VERSION,
        hardware_revision=version.HARDWARE_REVISION,
        cad_revision=version.CAD_REVISION,
        config_hash=config_hash,
        configuration_snapshot=configuration_snapshot
    )
    db.add(job_record)
    db.commit()
    
    ACTIVE_JOBS[job_id] = {"is_cancelled": False, "progress": 0.0}
    
    def _run_job_task(j_id: str, p: MonteCarloParams):
        db_session = next(get_db())
        job = db_session.query(models.SimulationJob).filter_by(job_id=j_id).first()
        if not job:
            db_session.close()
            return
            
        job.status = "RUNNING"
        job.started_at = datetime.datetime.now(datetime.UTC)
        db_session.commit()
        
        try:
            engine = BallisticsEngine()
            engine.targetDistance = p.target_distance
            engine.launchElevationDeg = p.launch_elevation_deg
            engine.windSpeedX = p.wind_speed_x
            engine.windSpeedZ = p.wind_speed_z
            engine.latitudeDeg = p.latitude_deg
            engine.firingAzimuthDeg = p.firing_azimuth_deg
            engine.isWindShearEnabled = p.is_wind_shear_enabled
            engine.windLowX = p.wind_low_x
            engine.windMedX = p.wind_med_x
            engine.windHighX = p.wind_high_x
            engine.windLowZ = p.wind_low_z
            engine.windMedZ = p.wind_med_z
            engine.windHighZ = p.wind_high_z
            engine.fuzeMode = p.fuze_mode
            engine.fuzeDelayMs = p.fuze_delay_ms
            engine.navigationMode = p.navigation_mode
            engine.proximityHeight = p.proximity_height
            engine.programmedFlightTime = p.programmed_flight_time
            
            u = p.uncertainty
            engine.isUncertaintyActive = u.is_active
            engine.uncWind = u.wind_uncertainty_mps
            engine.uncAngle = u.angle_uncertainty_deg
            engine.uncMuzzle = u.muzzle_velocity_uncertainty_mps
            engine.uncGnss = u.gnss_noise_m
            engine.uncInsDrift = u.ins_drift_mps
            
            engine.random_seed = p.random_seed
            engine.runId = j_id
            
            cancel_flag = ACTIVE_JOBS.get(j_id, {})
            def prog_cb(pct):
                if j_id in ACTIVE_JOBS:
                    ACTIVE_JOBS[j_id]["progress"] = pct
                    
            results = engine.run_monte_carlo_cep(p.runs, guided=p.is_pgk_enabled, cancel_flag=cancel_flag, progress_callback=prog_cb)
            
            # === Deterministic result hash (computed BEFORE metadata injection) ===
            # This hash covers only physics outputs — same inputs will produce same hash.
            raw_result_json = json.dumps(results, sort_keys=True)
            result_hash = hashlib.sha256(raw_result_json.encode('utf-8')).hexdigest()
            
            snapshot_dict = json.loads(job.configuration_snapshot) if job.configuration_snapshot else {}
            snapshot_dict["result_hash"] = result_hash
            job.configuration_snapshot = json.dumps(snapshot_dict, sort_keys=True)
            
            results["metadata"] = {
                "run_id": j_id,
                "configuration_snapshot": snapshot_dict,
                "configuration_hash": job.config_hash,
                "config_version": CONFIG_VERSION,
                "model_version": PHYSICS_VERSION,
                "simulation_parameters": p.model_dump(),
                "random_seed": engine.random_seed,
                "result_hash": result_hash,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat()
            }
            
            result_json = json.dumps(results)
            
            job.status = "COMPLETED"
            job.progress = 1.0
            job.completed_at = datetime.datetime.now(datetime.UTC)
            job.result_data = result_json
            job.result_hash = result_hash
            db_session.commit()
            
            # === P3: Auto Evidence Generation ===
            # After a successful MC job, create a TestRun and link it as evidence
            # for the key CEP/Guidance/Control requirements.
            try:
                _auto_generate_evidence(db_session, j_id, p, results, job)
            except Exception as ev_err:
                print(f"[AutoEvidence] Warning: failed to auto-generate evidence: {ev_err}")
            
        except Exception as e:
            db_session.rollback()
            if str(e) == "Job cancelled by user":
                job.status = "CANCELLED"
            else:
                job.status = "FAILED"
                job.error_message = str(e)
            job.completed_at = datetime.datetime.now(datetime.UTC)
            db_session.commit()
        finally:
            ACTIVE_JOBS.pop(j_id, None)
            db_session.close()

    background_tasks.add_task(_run_job_task, job_id, params)
    
    return {
        "status": "success",
        "job_id": job_id,
        "config_hash": config_hash
    }

def _auto_generate_evidence(db_session, job_id: str, params, results: dict, job):
    """Creates a TestRun + RequirementEvidence records after a successful Monte Carlo job."""
    import models as m
    from version import (
        BACKEND_VERSION,
        PHYSICS_VERSION,
    )
    
    cep50 = results.get('cepGuided50', 0.0)
    cep90 = results.get('cepGuided90', 0.0)
    unc50 = results.get('cepUnguided50', 0.0)
    nav_mode = getattr(params, 'navigation_mode', 'NORMAL')
    runs_count = getattr(params, 'runs', 0)
    
    # Build a unique test_id based on job_id
    short_id = job_id[:8].upper()
    test_id = f"AUTO-{short_id}"
    
    # Check if already exists
    existing = db_session.query(m.TestRun).filter_by(test_id=test_id).first()
    if existing:
        return
    
    observed_str = f"CEP50={cep50:.1f}m, CEP90={cep90:.1f}m, Unguided={unc50:.1f}m"
    if nav_mode != "NORMAL":
        observed_str += f" [Nav={nav_mode}]"
    
    # CEP accuracy evidence always maps to REQ-024 (CEP objective: CEP50 ≤ 30m at 15km).
    # REQ-022 is the simulation model requirement (≥5 physical effects modelled) and must
    # NOT receive CEP trajectory results — those are different claims.
    # Extended-range runs are out-of-standard-scenario and are noted in the notes field only.
    cep_req = "REQ-024"
    expected_str = "CEP50 ≤ 30m at 15km (REQ-024)"
    if params.target_distance > 15000.0:
        expected_str = f"CEP50 (extended range {params.target_distance/1000:.1f}km — non-standard scenario, REQ-024 threshold is at 15km)"

    tr = m.TestRun(
        test_id=test_id,
        date=datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d"),
        objective=f"Auto-generated MC simulation evidence — {runs_count} rounds, Nav={nav_mode}, Range={params.target_distance / 1000.0:.1f}km",
        model_version=PHYSICS_VERSION,
        software_version=BACKEND_VERSION,
        hardware_version="SIMULATED",
        config=f"Seed={job.random_seed}, Hash={job.config_hash[:8]}, Runs={runs_count}",
        expected=expected_str,
        observed=observed_str,
        status="SIMULATED",
        notes=f"Auto-generated from job {job_id}. Result hash: {job.result_hash[:16] if job.result_hash else 'N/A'}",
        source_type="SIMULATION",
        evidence=f"job_id={job_id}"
    )
    db_session.add(tr)
    db_session.flush()
    
    # Use: Simulation Scenario -> Explicit Verification Objective -> Specific Requirement(s) -> Evidence
    evidence_reqs = []
    
    # 1. CEP Requirement (REQ-024)
    # Verification condition: Base parameters, 100+ runs, PGK enabled, standard wind conditions
    if params.runs >= 100 and params.is_pgk_enabled and not params.is_wind_shear_enabled and getattr(params, 'target_distance', 0) <= 15000.0:
        evidence_reqs.append("REQ-024")

    # 2. Guidance/Control Requirements (REQ-004, REQ-006)
    # Verification condition: Wind shear enabled or strong cross winds
    if params.is_pgk_enabled and (params.is_wind_shear_enabled or abs(params.wind_speed_x) > 0 or abs(params.wind_speed_z) > 0):
        evidence_reqs.append("REQ-004")
        evidence_reqs.append("REQ-006")

    # 3. Navigation Requirements (REQ-005)
    if nav_mode != "NORMAL":
        evidence_reqs.append("REQ-005")
        
    if not evidence_reqs:
        db_session.commit()
        print(f"[AutoEvidence] Skipping evidence generation for {test_id} — no specific verification criteria met.")
        return
    
    for req_id_str in evidence_reqs:
        req = db_session.query(m.Requirement).filter_by(req_id=req_id_str).first()
        if req:
            ev = m.RequirementEvidence(
                requirement_id=req.id,
                reference_id=test_id,
                source_type="SIMULATION",
                evidence_status="NOT_VALIDATED"
            )
            db_session.add(ev)
            # Update requirement status to SIMULATED if it was PENDING
            if req.status in ("PENDING", "DESIGN ESTIMATE"):
                req.status = "SIMULATED"
    
    db_session.commit()
    print(f"[AutoEvidence] Created TestRun {test_id} with evidence for {evidence_reqs}")


@router.get("/jobs/latest", summary="Get Latest Completed Job")
def get_latest_job(db: Session = Depends(get_db)):
    """Returns the most recently COMPLETED Monte Carlo job's results.
    Used by Judge Mode and Report Generator to display live simulation data."""
    job = (
        db.query(models.SimulationJob)
        .filter(models.SimulationJob.status == "COMPLETED")
        .order_by(models.SimulationJob.completed_at.desc())
        .first()
    )
    if not job:
        return {"status": "no_data", "message": "No completed simulation jobs found. Run a Monte Carlo simulation first."}
    
    result = json.loads(job.result_data) if job.result_data else {}
    return {
        "status": "success",
        "job_id": job.job_id,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "random_seed": job.random_seed,
        "config_hash": job.config_hash,
        "result_hash": job.result_hash,
        "physics_version": job.physics_version,
        "backend_version": job.backend_version,
        "cep_guided_50": result.get("cepGuided50"),
        "cep_guided_90": result.get("cepGuided90"),
        "cep_unguided_50": result.get("cepUnguided50"),
        "cep_unguided_90": result.get("cepUnguided90"),
        "runs": result.get("numRounds"),
        "max_radial_error": result.get("maxRadialError"),
        "std_dev": result.get("stdDev"),
        "nav_mode": result.get("navMode", "NORMAL"),
        "raw": result,
        "configuration_snapshot": json.loads(job.configuration_snapshot) if job.configuration_snapshot else None,
        "provenance": {
            "value": result.get("cepGuided50"),
            "source": f"SIM-{job.job_id[:8].upper()}",
            "status": "SIMULATED",
            "model_version": job.physics_version,
            "config_version": job.config_hash[:8] if job.config_hash else None,
            "timestamp": job.completed_at.isoformat() if job.completed_at else None
        }
    }


@router.get("/jobs/history", summary="List Job History")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.SimulationJob).order_by(models.SimulationJob.created_at.desc()).limit(50).all()
    return [{
        "job_id": j.job_id,
        "status": j.status,
        "random_seed": j.random_seed,
        "physics_version": j.physics_version,
        "config_hash": j.config_hash,
        "result_hash": j.result_hash,
        "created_at": j.created_at
    } for j in jobs]

@router.get("/jobs/{job_id}", summary="Get Job Status")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.SimulationJob).filter_by(job_id=job_id).first()
    if not job:
        return {"status": "not_found"}
        
    progress = job.progress
    if job.status == "RUNNING" and job_id in ACTIVE_JOBS:
        progress = ACTIVE_JOBS[job_id]["progress"]
        
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": progress,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "random_seed": job.random_seed,
        "model_version": job.physics_version,
        "config_hash": job.config_hash,
        "error_message": job.error_message,
        "configuration_snapshot": json.loads(job.configuration_snapshot) if job.configuration_snapshot else None,
        "provenance": {
            "value": None,
            "source": f"SIM-{job.job_id[:8].upper()}",
            "status": job.status,
            "model_version": job.physics_version,
            "config_version": job.config_hash[:8] if job.config_hash else None,
            "timestamp": job.completed_at.isoformat() if job.completed_at else None
        } if job.status == "COMPLETED" else None
    }

@router.post("/jobs/{job_id}/replay", summary="Replay Job using Snapshot")
def replay_job(job_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Parameter-snapshot replay of a past job.

    Reproduces the simulation_parameters and random_seed from the stored
    configuration_snapshot.  The new job runs against the current physics
    engine and canonical config — not a frozen binary environment — so this
    is a *parameter-snapshot replay*, not a full historical binary replay.

    The response includes original_result_hash so the caller can compare
    hashes and decide whether the results are reproducible under the current
    engine version.
    """
    past_job = db.query(models.SimulationJob).filter_by(job_id=job_id).first()
    if not past_job or not past_job.configuration_snapshot:
        return {"status": "error", "message": "Job snapshot not found"}

    snapshot = json.loads(past_job.configuration_snapshot)

    # Extract simulation parameters from the stored snapshot.
    # Build MonteCarloParams from the historical record so the seed is preserved.
    sim_params = snapshot.get("simulation_parameters", snapshot)
    # Ensure the historical random_seed is used even if params dict omits it
    if past_job.random_seed is not None and "random_seed" not in sim_params:
        sim_params = dict(sim_params)
        sim_params["random_seed"] = past_job.random_seed
    params = MonteCarloParams(**sim_params)
    
    # Calculate current equivalent configuration hash
    canonical_cfg = get_canonical_config_snapshot()
    current_snapshot_data = {
        "system_config": canonical_cfg["system"],
        "simulation_config": canonical_cfg["simulation"],
        "hardware_config": canonical_cfg["hardware"],
        "power_config": canonical_cfg["power"],
        "bom_config": canonical_cfg["bom"],
        "versions": {
            "system_version": SYSTEM_VERSION,
            "frontend_version": FRONTEND_VERSION,
            "backend_version": BACKEND_VERSION,
            "physics_version": PHYSICS_VERSION,
            "config_version": CONFIG_VERSION,
            "hardware_revision": HARDWARE_REVISION,
            "cad_revision": CAD_REVISION,
        },
        "model_version": PHYSICS_VERSION,
        "simulation_parameters": params.model_dump(),
        "random_seed": params.random_seed,
    }
    current_hash_data = {k: v for k, v in current_snapshot_data.items() if k != "timestamp"}
    current_config_hash = hashlib.sha256(json.dumps(current_hash_data, sort_keys=True).encode('utf-8')).hexdigest()
    
    # P1: Check for exact reproducibility before allowing replay
    if past_job.physics_version != PHYSICS_VERSION or past_job.config_hash != current_config_hash:
        return {
            "status": "error", 
            "message": "Historical replay unavailable with current model/configuration.",
            "details": {
                "stored_model_version": past_job.physics_version,
                "current_model_version": PHYSICS_VERSION,
                "stored_config_hash": past_job.config_hash,
                "current_config_hash": current_config_hash
            }
        }

    # Create the replay job (new job_id, new result_hash)
    replay_response = create_job(params, background_tasks, db)

    # Augment the response with original provenance so UI can show hash comparison
    replay_response["replay_type"] = "parameter_snapshot_replay"
    replay_response["original_job_id"] = job_id
    replay_response["original_result_hash"] = past_job.result_hash
    replay_response["original_config_hash"] = past_job.config_hash
    replay_response["original_physics_version"] = past_job.physics_version
    return replay_response

@router.get("/jobs/{job_id}/result", summary="Get Job Results")
def get_job_result(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.SimulationJob).filter_by(job_id=job_id).first()
    if not job:
        return {"status": "not_found"}
        
    if job.status != "COMPLETED":
        return {"status": "error", "message": f"Job is currently {job.status}"}
        
    return json.loads(job.result_data) if job.result_data else None

@router.post("/jobs/{job_id}/cancel", summary="Cancel Running Job")
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.SimulationJob).filter_by(job_id=job_id).first()
    if not job:
        return {"status": "not_found"}
        
    if job.status in ["QUEUED", "RUNNING"]:
        if job_id in ACTIVE_JOBS:
            ACTIVE_JOBS[job_id]["is_cancelled"] = True
        
        job.status = "CANCELLED"
        job.completed_at = datetime.datetime.now(datetime.UTC)
        db.commit()
        return {"status": "cancelled", "job_id": job_id}
    else:
        return {"status": "error", "message": f"Cannot cancel job in state {job.status}"}

# We also migrate the sensitivity job here to group background jobs
@router.post("/montecarlo/sensitivity", summary="Create Sensitivity Analysis Job", deprecated=True)
def create_sensitivity_job(params: MonteCarloParams, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    
    job_record = models.SimulationJob(
        job_id=job_id,
        status="QUEUED",
        progress=0.0,
        random_seed=params.random_seed,
        physics_version=PHYSICS_VERSION,
        config_hash="sensitivity"
    )
    db.add(job_record)
    db.commit()
    
    ACTIVE_JOBS[job_id] = {"is_cancelled": False, "progress": 0.0}
    
    def _run_sens_task(j_id: str, p: MonteCarloParams):
        db_session = next(get_db())
        job = db_session.query(models.SimulationJob).filter_by(job_id=j_id).first()
        if not job:
            db_session.close()
            return
            
        job.status = "RUNNING"
        job.started_at = datetime.datetime.now(datetime.UTC)
        db_session.commit()
        
        try:
            engine = BallisticsEngine()
            engine.targetDistance = p.target_distance
            engine.launchElevationDeg = p.launch_elevation_deg
            engine.windSpeedX = p.wind_speed_x
            engine.windSpeedZ = p.wind_speed_z
            engine.latitudeDeg = p.latitude_deg
            engine.firingAzimuthDeg = p.firing_azimuth_deg
            engine.isWindShearEnabled = p.is_wind_shear_enabled
            engine.windLowX = p.wind_low_x
            engine.windMedX = p.wind_med_x
            engine.windHighX = p.wind_high_x
            engine.windLowZ = p.wind_low_z
            engine.windMedZ = p.wind_med_z
            engine.windHighZ = p.wind_high_z
            engine.fuzeMode = p.fuze_mode
            engine.fuzeDelayMs = p.fuze_delay_ms
            engine.navigationMode = p.navigation_mode
            engine.proximityHeight = p.proximity_height
            engine.programmedFlightTime = p.programmed_flight_time
            
            u = p.uncertainty
            engine.isUncertaintyActive = u.is_active
            engine.uncWind = u.wind_uncertainty_mps
            engine.uncAngle = u.angle_uncertainty_deg
            engine.uncMuzzle = u.muzzle_velocity_uncertainty_mps
            engine.uncGnss = u.gnss_noise_m
            engine.uncInsDrift = u.ins_drift_mps
            
            engine.random_seed = p.random_seed
            engine.runId = j_id
            
            results = engine.run_sensitivity_analysis(p.runs)
            
            job.status = "COMPLETED"
            job.progress = 1.0
            job.completed_at = datetime.datetime.now(datetime.UTC)
            
            # Structure the results explicitly wrapping in a data dictionary if not already wrapped
            if isinstance(results, dict) and "data" in results:
                structured_results = results
            else:
                structured_results = {"data": results}
                
            job.result_data = json.dumps(structured_results)
            db_session.commit()
            
        except Exception as e:
            db_session.rollback()
            job.status = "FAILED"
            job.error_message = str(e)
            job.completed_at = datetime.datetime.now(datetime.UTC)
            db_session.commit()
        finally:
            ACTIVE_JOBS.pop(j_id, None)
            db_session.close()

    background_tasks.add_task(_run_sens_task, job_id, params)
    
    return {
        "status": "success",
        "job_id": job_id
    }
