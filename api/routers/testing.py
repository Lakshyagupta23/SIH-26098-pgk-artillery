import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter(tags=["Testing & Validation"])

ALLOWED_TEST_STATUSES = {"PASS", "FAIL", "SKIPPED", "RUNNING", "SIMULATED", "PENDING"}

class TestRunUpdate(BaseModel):
    objective: str
    status: str
    model_version: str
    software_version: str
    hardware_version: str
    config: str
    expected: str
    observed: str
    notes: str = ""
    evidence: str = ""
    source_type: str = "MANUAL"


class RequirementStatusUpdate(BaseModel):
    status: str


@router.get("/requirements", summary="Get System Requirements")
def get_requirements(db: Session = Depends(get_db)):
    """Fetch all loaded SRD requirements with full evidence chain."""
    reqs = db.query(models.Requirement).order_by(models.Requirement.req_id).all()
    results = []
    for r in reqs:
        evidence_list = [
            {
                "reference_id": ev.reference_id,
                "source_type": ev.source_type,
                "status": ev.evidence_status
            } for ev in r.evidence
        ]
        results.append({
            "id": r.req_id,
            "name": r.name,
            "description": r.description or "",
            "threshold": r.threshold or "",
            "verification_method": r.verification_method or "",
            "status": r.status,
            "evidence": evidence_list
        })
    return {"status": "success", "data": results}


@router.get("/requirements/{req_id}", summary="Get Single Requirement")
def get_requirement(req_id: str, db: Session = Depends(get_db)):
    """Fetch a single SRD requirement with its full evidence chain."""
    req = db.query(models.Requirement).filter(models.Requirement.req_id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Requirement '{req_id}' not found")
    evidence_list = [
        {
            "reference_id": ev.reference_id,
            "source_type": ev.source_type,
            "status": ev.evidence_status
        } for ev in req.evidence
    ]
    return {
        "status": "success",
        "data": {
            "id": req.req_id,
            "name": req.name,
            "description": req.description or "",
            "threshold": req.threshold or "",
            "verification_method": req.verification_method or "",
            "status": req.status,
            "evidence": evidence_list
        }
    }


@router.put("/requirements/{req_id}/status", summary="Update Requirement Status")
def update_requirement_status(req_id: str, payload: RequirementStatusUpdate, db: Session = Depends(get_db)):
    """Update the status of an existing SRD requirement."""
    req = db.query(models.Requirement).filter(models.Requirement.req_id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"Requirement '{req_id}' not found")
    
    if payload.status.upper() in ["VALIDATED", "PASSED"]:
        # Must have at least 1 evidence entry that is VALIDATED
        valid_evidence = [e for e in req.evidence if e.evidence_status == "VALIDATED" or e.source_type == "HARDWARE_MEASURED"]
        if not valid_evidence:
            raise HTTPException(status_code=400, detail="Cannot mark requirement as VALIDATED without valid hardware/validated evidence.")
        payload.status = "VALIDATED"
        
    req.status = payload.status
    db.commit()
    return {"status": "success", "req_id": req_id, "new_status": req.status}


@router.get("/validation/summary", summary="Get Validation Compliance Summary")
def get_validation_summary(db: Session = Depends(get_db)):
    """Returns a live compliance summary: counts per status, overall score, unmet critical requirements."""
    reqs = db.query(models.Requirement).all()
    
    status_counts = {
        "SIMULATED": 0,
        "DESIGN ESTIMATE": 0,
        "PENDING": 0,
        "PASSED": 0,
        "FAILED": 0,
    }
    total = len(reqs)
    
    # Requirements we consider "critical" (must be at least SIMULATED)
    CRITICAL_REQS = {"REQ-004", "REQ-005", "REQ-006", "REQ-007", "REQ-011", "REQ-016", "REQ-022"}
    unmet_critical = []
    
    for r in reqs:
        s = r.status.upper() if r.status else "PENDING"
        if s in status_counts:
            status_counts[s] += 1
        else:
            status_counts["PENDING"] = status_counts.get("PENDING", 0) + 1
        
        if r.req_id in CRITICAL_REQS and s not in ("SIMULATED", "PASSED"):
            unmet_critical.append({
                "req_id": r.req_id,
                "name": r.name,
                "status": r.status,
                "threshold": r.threshold or ""
            })
    
    # Verification coverage: requirements that are SIMULATED or PASSED / total.
    # This metric represents simulation/verification progress — not regulatory compliance.
    # IMPORTANT: SIMULATED ≠ VALIDATED. Physical validation (DEMONSTRATION tests) required for PASSED status.
    simulated_count = status_counts["SIMULATED"]
    validated_count = status_counts["PASSED"]
    met = simulated_count + validated_count
    verification_coverage = round((met / total * 100), 1) if total > 0 else 0.0
    simulation_coverage_pct = round((simulated_count / total * 100), 1) if total > 0 else 0.0
    validated_pct = round((validated_count / total * 100), 1) if total > 0 else 0.0
    
    # Evidence completeness: how many reqs have at least 1 evidence entry
    reqs_with_evidence = sum(1 for r in reqs if len(r.evidence) > 0)
    evidence_coverage = round((reqs_with_evidence / total * 100), 1) if total > 0 else 0.0
    
    return {
        "status": "success",
        "data": {
            "total_requirements": total,
            "status_counts": status_counts,
            "verification_coverage_pct": verification_coverage,
            "simulation_coverage_pct": simulation_coverage_pct,
            "validated_pct": validated_pct,
            "evidence_coverage_pct": evidence_coverage,
            "reqs_with_evidence": reqs_with_evidence,
            "unmet_critical": unmet_critical,
            "pending_physical_tests": [
                r.req_id for r in reqs
                if r.status == "PENDING" and r.verification_method == "DEMONSTRATION"
            ],
            "evidence_integrity_note": (
                "SIMULATED status means the requirement has been verified by software simulation only. "
                "PASSED (VALIDATED) status requires physical demonstration or validated test results. "
                "No requirements in this system have yet achieved PASSED status — all are SIMULATED, "
                "DESIGN ESTIMATE, or PENDING physical validation."
            )
        }
    }


@router.get("/tests", summary="Get Test Runs (Alias)", deprecated=True)
def get_tests_alias(db: Session = Depends(get_db)):
    return get_test_runs(db)

@router.get("/test-runs", summary="Get Test Runs")
def get_test_runs(db: Session = Depends(get_db)):
    """Fetch all test execution records, ordered newest first."""
    runs = db.query(models.TestRun).order_by(models.TestRun.date.desc()).all()
    return {"status": "success", "data": [
        {
            "id": tr.test_id,
            "date": tr.date,
            "objective": tr.objective,
            "model_version": tr.model_version,
            "software_version": tr.software_version,
            "hardware_version": tr.hardware_version,
            "config": tr.config,
            "expected": tr.expected,
            "observed": tr.observed,
            "status": tr.status,
            "notes": tr.notes,
            "source_type": tr.source_type,
            "evidence": tr.evidence or ""
        } for tr in runs
    ]}

@router.post("/test-runs", summary="Create or Update Test Run")
def create_test_run(run_data: TestRunUpdate, db: Session = Depends(get_db)):
    if run_data.status not in ALLOWED_TEST_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status '{run_data.status}'. Must be one of {ALLOWED_TEST_STATUSES}")
    
    tr = models.TestRun(
        date=datetime.datetime.now(datetime.UTC).date(),
        objective=run_data.objective,
        model_version=run_data.model_version,
        software_version=run_data.software_version,
        hardware_version=run_data.hardware_version,
        config=run_data.config,
        expected=run_data.expected,
        observed=run_data.observed,
        status=run_data.status,
        notes=run_data.notes,
        evidence=run_data.evidence,
        source_type=run_data.source_type,
        test_id=f"TEST-{datetime.datetime.now(datetime.UTC).strftime('%Y%m%d%H%M%S')}"
    )
    db.add(tr)
    db.commit()
    db.refresh(tr)
    
    return {"status": "success", "test_id": tr.test_id}


