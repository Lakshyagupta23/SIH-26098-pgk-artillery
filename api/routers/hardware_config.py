import os

from fastapi import APIRouter

from config import HARDWARE_CONFIG, HardwareConfig

router = APIRouter(prefix="/api/config", tags=["Configuration"])

@router.get("/hardware", response_model=HardwareConfig)
def get_hardware_config():
    """
    Returns the centralized physical and hardware configuration for the system.
    """
    return HARDWARE_CONFIG

@router.get("", summary="Get Application Config (tokens, feature flags)")
def get_app_config():
    """
    Returns non-sensitive application config, including the Cesium Ion token.
    Cesium globe JS fetches this on init to avoid baking secrets into static files.
    """
    token = os.environ.get("CESIUM_ION_TOKEN", "")
    return {
        "cesium_token": token,
        "cesium_available": bool(token.strip()),
        "environment": os.environ.get("ENVIRONMENT", "development")
    }
