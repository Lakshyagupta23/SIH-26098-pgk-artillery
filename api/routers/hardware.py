import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from api.schemas import FuzeConfig, HardwareEvent
from database import get_db

router = APIRouter(tags=["Hardware & Events"])

@router.post("/fuze/config", summary="Set Fuze Configuration")
async def set_fuze_config(config: FuzeConfig, db: Session = Depends(get_db)):
    """Programs the smart fuze and logs the configuration event."""
    event = models.SystemEvent(
        event_type="FUZE_CONFIG_UPDATED",
        details=json.dumps(config.model_dump())
    )
    db.add(event)
    db.commit()
    return {"status": "success", "programmed_mode": config.mode}

@router.get("/fuze/status", summary="Get Fuze Status")
async def get_fuze_status(db: Session = Depends(get_db)):
    """Retrieves the latest fuze configuration."""
    latest_event = db.query(models.SystemEvent).filter(
        models.SystemEvent.event_type == "FUZE_CONFIG_UPDATED"
    ).order_by(models.SystemEvent.id.desc()).first()

    if latest_event and latest_event.details:
        data = json.loads(latest_event.details)
        return {"status": "ARMED", "mode": data.get("mode", "PROXIMITY")}
    
    return {"status": "UNARMED", "mode": "UNKNOWN"}

@router.post("/events", summary="Log Hardware Event")
async def log_event(event: HardwareEvent, db: Session = Depends(get_db)):
    event_details = event.details.copy()
    event_details["source_type"] = event.source_type
    
    db_event = models.SystemEvent(
        event_type=event.event_type,
        timestamp=event.timestamp,
        details=json.dumps(event_details)
    )
    db.add(db_event)
    db.commit()
    return {"status": "logged", "event_id": event.event_id}

@router.get("/events", summary="Get Recent Events")
async def get_events(db: Session = Depends(get_db)):
    """Retrieves system event logs."""
    events = db.query(models.SystemEvent).order_by(models.SystemEvent.id.desc()).limit(50).all()
    return {"events": [
        {
            "id": e.id,
            "type": e.event_type,
            "timestamp": e.timestamp.isoformat(),
            "details": json.loads(e.details) if e.details else {}
        }
        for e in events
    ]}
