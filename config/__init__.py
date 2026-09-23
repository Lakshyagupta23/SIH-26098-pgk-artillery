from .bom_config import BOM_CONFIG, BomConfig
from .hardware_config import HARDWARE_CONFIG, HardwareConfig
from .power_config import POWER_CONFIG, PowerConfig
from .simulation_config import SIMULATION_CONFIG, SimulationConfig
from .system_config import SYSTEM_CONFIG, SystemConfig


def get_canonical_config_snapshot() -> dict:
    """Returns a complete snapshot of all engineering constants to store with simulations."""
    return {
        "system": SYSTEM_CONFIG.model_dump(),
        "simulation": SIMULATION_CONFIG.model_dump(),
        "hardware": HARDWARE_CONFIG.model_dump(),
        "power": POWER_CONFIG.model_dump(),
        "bom": BOM_CONFIG.model_dump()
    }
