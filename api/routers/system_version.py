from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter()

@router.get("")
def get_versions(db: Session = Depends(get_db)):
    """
    Returns the complete system version manifest from the database.
    """
    versions = db.query(models.SystemVersion).first()
    if not versions:
        import version
        return {
            "status": "success", 
            "data": {
                "frontend_version": version.FRONTEND_VERSION,
                "backend_version": version.BACKEND_VERSION,
                "physics_version": version.PHYSICS_VERSION,
                "configuration_version": version.CONFIG_VERSION,
                "hardware_revision": version.HARDWARE_REVISION,
                "cad_revision": version.CAD_REVISION
            }
        }

    return {
        "status": "success",
        "data": {
            "frontend_version": versions.frontend_version,
            "backend_version": versions.backend_version,
            "physics_version": versions.physics_version,
            "configuration_version": versions.config_version,
            "hardware_revision": versions.hardware_revision,
            "cad_revision": versions.cad_revision
        }
    }
