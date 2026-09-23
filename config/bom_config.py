
from pydantic import BaseModel


class BomItem(BaseModel):
    component_id: str
    name: str = ""
    category: str
    representative_part: str
    supplier: str = "TBD"
    quantity: int = 1
    unit_cost: float
    mass_g: float
    power_mw: float
    source: str = "DESIGN ESTIMATE"
    confidence: str = "LOW"
    status: str = "ESTIMATED"
    revision: str | None = None

class BomConfig(BaseModel):
    title: str = "PRELIMINARY CONCEPT BOM"
    components: list[BomItem] = [
        BomItem(component_id="BOM-001", name="Flight Computer", category="Avionics (MCU)", representative_part="STM32H743 / TI TMS570", supplier="ST / TI", quantity=1, unit_cost=45.0, mass_g=12.5, power_mw=450.0, source="DESIGN ESTIMATE", confidence="HIGH", status="REPRESENTATIVE"),
        BomItem(component_id="BOM-002", name="6-Axis IMU", category="Navigation (IMU)", representative_part="ADIS16495 / HG1120", supplier="Analog Devices", quantity=1, unit_cost=1250.0, mass_g=25.0, power_mw=800.0, source="DESIGN ESTIMATE", confidence="MEDIUM", status="REPRESENTATIVE"),
        BomItem(component_id="BOM-003", name="GNSS Receiver", category="Navigation (GNSS)", representative_part="NovAtel OEM7600", supplier="NovAtel", quantity=1, unit_cost=850.0, mass_g=35.0, power_mw=1100.0, source="DESIGN ESTIMATE", confidence="MEDIUM", status="ESTIMATED"),
        BomItem(component_id="BOM-004", name="Proximity Radar", category="Sensor (Radar)", representative_part="BGT24M / TI IWR6843", supplier="Infineon", quantity=1, unit_cost=120.0, mass_g=15.0, power_mw=600.0, source="DESIGN ESTIMATE", confidence="LOW", status="ESTIMATED"),
        BomItem(component_id="BOM-005", name="Canard Actuator", category="Actuation (Servo)", representative_part="Maxon ECX SP 8mm", supplier="Maxon Motor", quantity=4, unit_cost=350.0, mass_g=18.0, power_mw=1200.0, source="DESIGN ESTIMATE", confidence="HIGH", status="ESTIMATED"),
        BomItem(component_id="BOM-006", name="Rotary Bearing", category="Mechanical", representative_part="SKF 608-Z Bearing", supplier="SKF / Timken", quantity=2, unit_cost=45.0, mass_g=45.0, power_mw=0.0, source="DESIGN ESTIMATE", confidence="HIGH", status="ESTIMATED"),
        BomItem(component_id="BOM-007", name="Reserve Battery", category="Power (Battery)", representative_part="EaglePicher EAP-123", supplier="EaglePicher", quantity=1, unit_cost=350.0, mass_g=120.0, power_mw=0.0, source="DESIGN ESTIMATE", confidence="MEDIUM", status="ESTIMATED"),
        BomItem(component_id="BOM-008", name="Safety & Arming", category="Ordnance (ESAD)", representative_part="MEMS S&A Device", supplier="L3Harris / Kaman", quantity=1, unit_cost=280.0, mass_g=80.0, power_mw=150.0, source="DESIGN ESTIMATE", confidence="HIGH", status="ESTIMATED"),
        BomItem(component_id="BOM-009", name="Aero Housing", category="Mechanical (Housing)", representative_part="Machined Ti-6Al-4V", supplier="Various", quantity=1, unit_cost=120.0, mass_g=450.0, power_mw=0.0, source="DESIGN ESTIMATE", confidence="HIGH", status="ESTIMATED")
    ]
    
BOM_CONFIG = BomConfig()
