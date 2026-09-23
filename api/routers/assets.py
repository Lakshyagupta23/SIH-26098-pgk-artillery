import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from api.schemas import Document as DocumentSchema
from database import get_db

router = APIRouter(tags=["Assets & Documentation"])

@router.get("/cad", summary="Get CAD Metadata")
async def get_cad(db: Session = Depends(get_db)):
    """Retrieve 3D model metadata from database."""
    cads = db.query(models.CadModel).all()
    if not cads:
        return {"status": "success", "data": []}
    return {"status": "success", "data": [{"id": c.id, "file_path": c.file_path, "version": c.version} for c in cads]}

@router.get("/cad/download", summary="Download CAD File")
async def download_cad():
    """Download the actual conceptual/inert CAD deliverable."""
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "cad", "SIH_CAD.step")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="CAD file not found")
    return FileResponse(path=file_path, filename="SIH_CAD.step", media_type="application/step")

@router.post("/documents", summary="Upload Document")
async def add_document(doc: DocumentSchema, db: Session = Depends(get_db)):
    """Index a technical document."""
    new_doc = models.Document(
        doc_id=doc.doc_id,
        title=doc.title,
        url=doc.url
    )
    db.add(new_doc)
    db.commit()
    return {"status": "success", "doc_id": doc.doc_id}

@router.get("/documents", summary="List Documents")
async def list_documents(db: Session = Depends(get_db)):
    """List indexed documents."""
    docs = db.query(models.Document).all()
    return {
        "status": "success", 
        "data": [
            {"doc_id": d.doc_id, "title": d.title, "url": d.url} for d in docs
        ]
    }
