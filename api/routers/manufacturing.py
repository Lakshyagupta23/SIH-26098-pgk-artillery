
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from api.schemas import Component
from database import get_db

router = APIRouter(tags=["Manufacturing"])

@router.get("/bom", summary="Get Bill of Materials")
async def get_bom(db: Session = Depends(get_db)):
    """Endpoint to return BOM from database."""
    items = db.query(models.BomItem).all()
    
    bom_list = []
    total_cost = 0.0
    total_mass = 0.0
    total_power = 0.0
    
    for i in items:
        bom_list.append({
            "component_id": i.component_id,
            "name": i.name,
            "category": i.category,
            "representative_part": i.representative_part,
            "supplier": i.supplier,
            "quantity": i.quantity,
            "unit_cost": i.unit_cost,
            "mass_g": i.mass_g,
            "power_mw": i.power_mw,
            "status": i.status,
            "source": i.source,
            "confidence": i.confidence
        })
        total_cost += (i.unit_cost * i.quantity)
        total_mass += (i.mass_g * i.quantity)
        total_power += (i.power_mw * i.quantity)
        
    bom_data = {
        "title": "PRELIMINARY CONCEPT BOM",
        "components": bom_list
    }
    
    return {"status": "success", "data": bom_list, "total_cost": total_cost, "total_mass": total_mass, "total_power": total_power}

@router.post("/components", summary="Add Component")
async def add_component(comp: Component, db: Session = Depends(get_db)):
    """Add a component to the Bill of Materials."""
    new_bom_item = models.BomItem(
        component_id=comp.part_number,
        name=comp.name,
        category="Custom",
        representative_part=comp.name,
        quantity=1,
        unit_cost=0.0,
        mass_g=0.0,
        power_mw=0.0,
        source=comp.status,
        revision=comp.revision
    )
    db.add(new_bom_item)
    db.commit()
    return {"status": "success", "component_id": comp.part_number}

@router.get("/components", summary="List Components")
async def list_components(db: Session = Depends(get_db)):
    """List all physical components in the BOM."""
    items = db.query(models.BomItem).all()
    return {
        "status": "success",
        "data": [
            {
                "part_number": i.component_id,
                "name": i.representative_part,
                "revision": i.revision or "1.0",
                "status": i.source
            } for i in items
        ]
    }
