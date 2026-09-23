from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter(tags=["System"])

@router.get("/health", summary="System Health Check")
async def health_check():
    """Lightweight endpoint used by the offline connectivity monitor.
    Returns 200 OK when backend is reachable."""
    import datetime

    import version
    return {
        "status": "ok",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "versions": {
            "SYSTEM_VERSION": version.SYSTEM_VERSION,
            "FRONTEND_VERSION": version.FRONTEND_VERSION,
            "BACKEND_VERSION": version.BACKEND_VERSION,
            "PHYSICS_VERSION": version.PHYSICS_VERSION,
            "CONFIG_VERSION": version.CONFIG_VERSION,
            "HARDWARE_REVISION": version.HARDWARE_REVISION,
            "CAD_REVISION": version.CAD_REVISION,
        },
    }





@router.get("/audit", summary="Get Audit Logs")
async def get_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(100).all()
    return {
        "status": "success",
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "actor": log.actor,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "details": log.details
            } for log in logs
        ]
    }
