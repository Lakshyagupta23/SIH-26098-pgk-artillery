from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter(tags=["Power"])

@router.get("/power", summary="Get Power Budget")
async def get_power_budget(db: Session = Depends(get_db)):
    """Endpoint to return Power Budget from database."""
    items = db.query(models.PowerSubsystem).all()
    
    subsystems = []
    total_nominal = 0.0
    total_peak = 0.0
    total_energy = 0.0
    
    for i in items:
        subsystems.append({
            "name": i.name,
            "nominal_power_mw": i.nominal_power_mw,
            "peak_power_mw": i.peak_power_mw,
            "duty_cycle_pct": i.duty_cycle_pct,
            "energy_mj": i.energy_mj,
            "conversion_efficiency": i.conversion_efficiency,
            "margin_pct": i.margin_pct,
            "source": getattr(i, "source", "DESIGN ESTIMATE"),
            "evidence_status": getattr(i, "evidence_status", "SIMULATED")
        })
        total_nominal += i.nominal_power_mw
        total_peak += i.peak_power_mw
        total_energy += i.energy_mj
        
    return {
        "status": "success",
        "title": "Prototype Power Architecture",
        "data": subsystems,
        "totals": {
            "total_nominal_mw": total_nominal,
            "total_peak_mw": total_peak,
            "total_energy_mj": total_energy,
            "system_margin_pct": 20.0
        }
    }
