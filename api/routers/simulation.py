import asyncio
import hashlib
import json
import random

from fastapi import APIRouter

from api.schemas import SimulationConfig
from physics import BallisticsEngine
from version import CONFIG_VERSION, PHYSICS_VERSION

router = APIRouter(tags=["Simulation"])

@router.post("/simulate", summary="Run Synchronous Simulation")
async def simulate(params: SimulationConfig):
    """
    Executes a single synchronous trajectory simulation.

    Uses the same BallisticsEngine and uncertainty model as the Monte Carlo
    endpoint (/api/jobs). Results are reproducible when random_seed is set.

    Navigation modes:
    - NORMAL: Full GNSS + INS
    - DEGRADED: GNSS noise x5
    - DENIED: INS-only (no GNSS corrections)
    """
    def _run_sim():
        # --- Seed RNG for reproducibility (P1-04) ---
        seed = params.random_seed
        if seed is not None:
            random.seed(seed)
            deterministic = True
        else:
            deterministic = False

        # --- Build engine using same parameter flow as MC (P1-02 / P1-03) ---
        engine = BallisticsEngine()
        engine.isPGKEnabled      = params.is_pgk_enabled
        engine.targetDistance    = params.target_distance
        engine.launchElevationDeg = params.launch_elevation_deg
        engine.windSpeedX        = params.wind_speed_x
        engine.windSpeedZ        = params.wind_speed_z
        engine.latitudeDeg       = params.latitude_deg
        engine.firingAzimuthDeg  = params.firing_azimuth_deg
        engine.isWindShearEnabled = params.is_wind_shear_enabled
        engine.windLowX  = params.wind_low_x
        engine.windMedX  = params.wind_med_x
        engine.windHighX = params.wind_high_x
        engine.windLowZ  = params.wind_low_z
        engine.windMedZ  = params.wind_med_z
        engine.windHighZ = params.wind_high_z
        engine.fuzeMode  = params.fuze_mode
        engine.fuzeDelayMs = params.fuze_delay_ms
        # Navigation mode (P1-05): NORMAL / DEGRADED / DENIED
        engine.navigationMode = params.navigation_mode
        engine.proximityHeight = params.proximity_height
        engine.programmedFlightTime = params.programmed_flight_time

        # Uncertainty parameters (P1-03)
        u = params.uncertainty
        engine.isUncertaintyActive = u.is_active
        engine.uncWind   = u.wind_uncertainty_mps
        engine.uncAngle  = u.angle_uncertainty_deg
        engine.uncMuzzle = u.muzzle_velocity_uncertainty_mps
        engine.uncGnss   = u.gnss_noise_m
        engine.uncInsDrift = u.ins_drift_mps
        engine.uncSensor   = u.sensor_noise_m
        engine.uncActuator = u.actuator_noise_deg
        engine.uncTiming   = u.timing_jitter_ms

        engine.init_flight()

        dt = 0.04
        while engine.state.time < 180 and not getattr(engine.state, 'detonated', False):
            engine.step(dt)

        history_data = []
        for i, pt in enumerate(engine.history):
            if i % 10 != 0 and i != len(engine.history) - 1:
                continue
            d = pt.__dict__.copy()
            d['t'] = d.get('time', 0.0)
            history_data.append(d)

        final_state_data = engine.state.__dict__.copy()
        final_state_data['t'] = final_state_data.get('time', 0.0)

        # --- Provenance / reproducibility fields (P1-04) ---
        params_dict = params.model_dump()
        config_hash = hashlib.sha256(
            json.dumps(params_dict, sort_keys=True, default=str).encode()
        ).hexdigest()
        result_payload = json.dumps(final_state_data, sort_keys=True, default=str).encode()
        result_hash = hashlib.sha256(result_payload).hexdigest()

        return {
            "status": "success",
            "history": history_data,
            "final_state": final_state_data,
            "provenance": {
                "model_version": PHYSICS_VERSION,
                "config_version": CONFIG_VERSION,
                "config_hash": config_hash,
                "result_hash": result_hash,
                "random_seed": seed,
                "deterministic": deterministic,
                "navigation_mode": params.navigation_mode,
                "simulation_type": "SINGLE_RUN_DETERMINISTIC" if deterministic else "SINGLE_RUN"
            }
        }
    return await asyncio.to_thread(_run_sim)
