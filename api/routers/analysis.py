import asyncio
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from api.schemas import SimulationConfig
from physics import BallisticsEngine

router = APIRouter(tags=["Analysis"])

@router.post("/analysis/sensitivity_contribution", summary="Calculate Sensitivity-Based Error Contribution")
async def sensitivity_contribution(params: SimulationConfig):
    """
    Runs controlled experiments to calculate the relative contribution
    of various uncertainties to the total CEP.

    This is a SENSITIVITY-BASED ERROR CONTRIBUTION analysis, not a formal
    error budget. Each source is isolated independently and the CEP delta
    is measured against a zero-uncertainty baseline.

    Muzzle velocity uncertainty is treated correctly: the nominal MV is
    first solved for range, then perturbed stochastically — the simulation
    does NOT re-solve MV to hit the target while uncertainty is active.
    """
    def _run_budget():
        results = {}
        
        # Helper to run a simulation with specific uncertainty
        def run_sim(config_overrides: dict[str, Any], runs=500):
            engine = BallisticsEngine()
            # Base config
            engine.isPGKEnabled = params.is_pgk_enabled
            engine.targetDistance = params.target_distance
            engine.launchElevationDeg = params.launch_elevation_deg
            engine.windSpeedX = params.wind_speed_x
            engine.windSpeedZ = params.wind_speed_z
            engine.latitudeDeg = params.latitude_deg
            engine.firingAzimuthDeg = params.firing_azimuth_deg
            engine.isWindShearEnabled = params.is_wind_shear_enabled
            engine.windLowX = params.wind_low_x
            engine.windMedX = params.wind_med_x
            engine.windHighX = params.wind_high_x
            engine.windLowZ = params.wind_low_z
            engine.windMedZ = params.wind_med_z
            engine.windHighZ = params.wind_high_z
            
            engine.isUncertaintyActive = True
            
            # Start with all zero
            engine.uncWind = 0.0
            engine.uncAngle = 0.0
            engine.uncMuzzle = 0.0
            engine.uncGnss = 0.0
            engine.uncInsDrift = 0.0
            engine.uncSensor = 0.0
            engine.uncActuator = 0.0
            engine.uncTiming = 0.0
            
            # Apply overrides
            for k, v in config_overrides.items():
                setattr(engine, k, v)
                
            engine.random_seed = 428193 # Deterministic baseline
            
            stats = engine.run_monte_carlo_cep(numRounds=runs, guided=True)
            return stats['cepGuided50']
        
        # 1. Baseline (no uncertainty)
        # Note: 0 uncertainty might give 0 CEP if perfectly targeted
        cep_base = run_sim({}, runs=100)
        
        u = params.uncertainty
        
        # 2. Individual runs
        cep_nav = run_sim({'uncGnss': u.gnss_noise_m, 'uncInsDrift': u.ins_drift_mps})
        cep_wind = run_sim({'uncWind': u.wind_uncertainty_mps})
        cep_angle = run_sim({'uncAngle': u.angle_uncertainty_deg})
        cep_muzzle = run_sim({'uncMuzzle': u.muzzle_velocity_uncertainty_mps})
        cep_sensor = run_sim({'uncSensor': u.sensor_noise_m})
        cep_actuator = run_sim({'uncActuator': u.actuator_noise_deg})
        cep_timing = run_sim({'uncTiming': u.timing_jitter_ms})
        
        # Simple variance sum estimation for relative contributions
        var_nav = max(0, cep_nav**2 - cep_base**2)
        var_wind = max(0, cep_wind**2 - cep_base**2)
        var_angle = max(0, cep_angle**2 - cep_base**2)
        var_muzzle = max(0, cep_muzzle**2 - cep_base**2)
        var_sensor = max(0, cep_sensor**2 - cep_base**2)
        var_actuator = max(0, cep_actuator**2 - cep_base**2)
        var_timing = max(0, cep_timing**2 - cep_base**2)
        
        total_var = var_nav + var_wind + var_angle + var_muzzle + var_sensor + var_actuator + var_timing
        if total_var == 0:
            total_var = 1.0 # avoid div/0
            
        return {
            "status": "success",
            "method": "SENSITIVITY-BASED ERROR CONTRIBUTION",
            "disclaimer": "Each error source is isolated independently. This is not a formal RSS/CEP error budget decomposition.",
            "base_cep": round(cep_base, 2),
            "contributions": [
                {
                    "source": "Navigation (GNSS + INS)",
                    "effect_m": round(cep_nav, 2),
                    "relative_pct": round((var_nav / total_var) * 100, 1),
                    "scenario": "GNSS denied / Drift"
                },
                {
                    "source": "Wind & Atmosphere",
                    "effect_m": round(cep_wind, 2),
                    "relative_pct": round((var_wind / total_var) * 100, 1),
                    "scenario": "Meteorological"
                },
                {
                    "source": "Launch Angle",
                    "effect_m": round(cep_angle, 2),
                    "relative_pct": round((var_angle / total_var) * 100, 1),
                    "scenario": "Gun pointing error"
                },
                {
                    "source": "Muzzle Velocity",
                    "effect_m": round(cep_muzzle, 2),
                    "relative_pct": round((var_muzzle / total_var) * 100, 1),
                    "scenario": "Propellant charge variance"
                },
                {
                    "source": "Sensor Noise",
                    "effect_m": round(cep_sensor, 2),
                    "relative_pct": round((var_sensor / total_var) * 100, 1),
                    "scenario": "Altitude Sensor Noise (Proximity Fuze Altimeter)"
                },
                {
                    "source": "Actuator Deviation",
                    "effect_m": round(cep_actuator, 2),
                    "relative_pct": round((var_actuator / total_var) * 100, 1),
                    "scenario": "Canard Mechanical Slop"
                },
                {
                    "source": "Timing Jitter",
                    "effect_m": round(cep_timing, 2),
                    "relative_pct": round((var_timing / total_var) * 100, 1),
                    "scenario": "Fuze Delay Variation"
                }
            ]
        }
    return await asyncio.to_thread(_run_budget)


class SensitivityRequest(BaseModel):
    config: SimulationConfig
    parameter: str
    values: list[float]
    runs: int = 100

@router.post("/analysis/sensitivity", summary="Run Sensitivity Sweep")
async def sensitivity_sweep(req: SensitivityRequest):
    """
    Runs a parameter sweep to determine sensitivity.
    """
    def _run_sweep():
        results = []
        for val in req.values:
            engine = BallisticsEngine()
            # Base config
            engine.isPGKEnabled = req.config.is_pgk_enabled
            engine.targetDistance = req.config.target_distance
            engine.launchElevationDeg = req.config.launch_elevation_deg
            engine.isWindShearEnabled = False # Simplify for sweep
            
            # Map parameter
            engine.isUncertaintyActive = True
            u = req.config.uncertainty
            engine.uncWind = u.wind_uncertainty_mps
            engine.uncAngle = u.angle_uncertainty_deg
            engine.uncMuzzle = u.muzzle_velocity_uncertainty_mps
            engine.uncGnss = u.gnss_noise_m
            engine.uncInsDrift = u.ins_drift_mps
            engine.uncSensor = u.sensor_noise_m
            engine.uncActuator = u.actuator_noise_deg
            engine.uncTiming = u.timing_jitter_ms
            
            override_mv = None
            if req.parameter == "uncGnss":
                engine.uncGnss = val
            elif req.parameter == "uncWind":
                engine.uncWind = val
            elif req.parameter == "uncAngle":
                engine.uncAngle = val
            elif req.parameter == "uncMuzzle":
                engine.uncMuzzle = val
            elif req.parameter == "uncSensor":
                engine.uncSensor = val
            elif req.parameter == "uncActuator":
                engine.uncActuator = val
            elif req.parameter == "uncTiming":
                engine.uncTiming = val
            elif req.parameter == "muzzleVelocity":
                override_mv = val
            
            engine.random_seed = 1337 # Constant seed for sweep
            
            stats = engine.run_monte_carlo_cep(numRounds=req.runs, guided=True, override_nominal_mv=override_mv)
            results.append({
                "value": val,
                "cep50": round(stats['cepGuided50'], 2)
            })
            
        return {
            "status": "success",
            "parameter": req.parameter,
            "results": results
        }
    return await asyncio.to_thread(_run_sweep)

@router.get("/analysis/model_assumptions", summary="Get Model Assumptions")
def get_model_assumptions():
    return {
        "status": "success",
        "model_name": "3D Point-Mass Trajectory Model with Guidance and Actuation Effects",
        "projectile_model": {
            "reference": "155mm M795 HE projectile (reference geometry; no classified data)",
            "mass_kg": 43.5,
            "mass_note": "Constant throughout flight (no base-bleed mass loss modelled)"
        },
        "assumptions": [
            "Earth is approximated as a flat, non-rotating reference frame for trajectory distances under 30km, though basic Coriolis terms are implemented.",
            "Atmospheric density follows the standard 1976 ISA model up to 20km.",
            "Projectile mass is constant at 43.5 kg throughout flight (no base-bleed mass loss).",
            "Wind shear is approximated using discrete vertical boundary layers.",
            "Aerodynamic coefficients are derived from standard 155mm M795 reference profiles and scaled by Mach number."
        ]
    }

@router.get("/analysis/model_limitations", summary="Get Model Limitations")
def get_model_limitations():
    return {
        "status": "success",
        "limitations": [
            "Not a full 6-DOF (Six Degrees of Freedom) rigid body model.",
            "Does not model complete internal ballistics or gun tube wear.",
            "No full aerodynamic moment tensor (pitch/yaw dynamics are simplified into a commanded acceleration).",
            "Proximity fuze altitude measurement uses a deterministic 1D altitude check rather than full 24.15 GHz-class FMCW RF multipath simulation.",
            "Actuator response models first-order slew rate limiting but lacks detailed electrical back-EMF modeling."
        ]
    }
