from fastapi import APIRouter

from api.schemas import FaultInjectionRequest, FaultInjectionResponse

router = APIRouter(tags=["Testing & Validation"])

@router.post("/faults/inject", response_model=FaultInjectionResponse, summary="Inject Fault into System")
async def inject_fault(request: FaultInjectionRequest):
    """Simulates a hardware or software fault and returns the logical system response."""
    
    fault_map = {
        "GNSS_LOSS": {
            "detection": "GNSS lock lost flag; Kalman filter innovation rejected",
            "system_response": "Disable GNSS measurement update in navigation filter",
            "recovery_mode": "INS Dead-Reckoning Only",
            "logged_event": "WARN_NAV_GNSS_TIMEOUT"
        },
        "SENSOR_BIAS": {
            "detection": "IMU cross-check limits exceeded",
            "system_response": "Re-calibrate bias states using high-confidence dynamic model",
            "recovery_mode": "Degraded Accuracy Mode",
            "logged_event": "WARN_SENSOR_IMU_BIAS"
        },
        "SENSOR_DROPOUT": {
            "detection": "SPI bus timeout for IMU register read",
            "system_response": "Trigger soft-reset of IMU bus and hold last known state",
            "recovery_mode": "Hold-State Extrapolation",
            "logged_event": "ERR_SENSOR_SPI_TIMEOUT"
        },
        "TELEMETRY_DROPOUT": {
            "detection": "Transmit buffer overflow; missing ACK",
            "system_response": "Drop low-priority packets; continue logging to local flash",
            "recovery_mode": "Local Logging Only",
            "logged_event": "WARN_TELEM_TX_FAIL"
        },
        "ACTUATOR_SATURATION": {
            "detection": "Commanded fin angle exceeds 15 deg physical limit",
            "system_response": "Clamp commanded deflection to 15 deg",
            "recovery_mode": "Control Authority Saturated",
            "logged_event": "WARN_ACT_SATURATION"
        },
        "TIMING_JITTER": {
            "detection": "Control loop execution time > 10ms",
            "system_response": "Skip non-critical background tasks (e.g., telemetry TX)",
            "recovery_mode": "Real-Time Priority Enforcement",
            "logged_event": "WARN_SYS_TIMING_JITTER"
        },
        "POWER_BROWNOUT": {
            "detection": "Main rail voltage < 9.5V",
            "system_response": "Safe state actuators; disable high-power telemetry; backup capacitor engaged",
            "recovery_mode": "Low Power Safe Mode",
            "logged_event": "ERR_PWR_BROWNOUT"
        }
    }

    fault = fault_map.get(request.fault_type, {
        "detection": "Unknown anomaly detected",
        "system_response": "Fallback to safe state",
        "recovery_mode": "Unknown",
        "logged_event": "ERR_UNKNOWN"
    })

    return FaultInjectionResponse(
        fault_injected=request.fault_type,
        detection=fault["detection"],
        system_response=fault["system_response"],
        recovery_mode=fault["recovery_mode"],
        logged_event=fault["logged_event"]
    )
