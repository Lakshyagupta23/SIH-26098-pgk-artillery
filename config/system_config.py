from pydantic import BaseModel

from version import SYSTEM_VERSION


class SystemConfig(BaseModel):
    version: str = SYSTEM_VERSION
    project_name: str = "SMARTGUIDE-155"
    description: str = "3D Reduced-Order Flight Dynamics Model and Inert Hardware Demonstrator"
    
SYSTEM_CONFIG = SystemConfig()
