from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_monte_carlo_validation():
    # Test valid request
    valid_payload = {
        "runs": 50,
        "target_distance": 20000.0,
        "launch_elevation_deg": 45.0,
        "random_seed": 12345
    }
    response = client.post("/api/jobs", json=valid_payload)
    assert response.status_code == 200
    
    # Test invalid request (negative distance)
    invalid_payload = {
        "runs": 50,
        "target_distance": -100.0,
        "launch_elevation_deg": 45.0
    }
    response = client.post("/api/jobs", json=invalid_payload)
    assert response.status_code == 422 # Pydantic validation error

def test_telemetry_post():
    import datetime
    import zlib
    # Create a session first (P1-09)
    sess_res = client.post("/api/telemetry/sessions", json={
        "device_id": "TEST-MCU-001",
        "mode": "SIL",
        "software_version": "2.2.0",
        "is_simulated": True
    })
    assert sess_res.status_code == 200
    session_id = sess_res.json()["session_id"]

    payload = {
        "session_id": session_id,
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
        "accelerometer": [0.0, 0.0, -9.81],
        "gyroscope": [0.0, 0.0, 0.0],
        "temperature": 25.0,
        "voltage": 12.0,
        "current": 1.0,
        "device_state": "SAFE",
        "sequence_number": 1,
        "checksum": ""
    }
    # Compute checksum including session_id (P1-10)
    payload_str = f"{session_id}:{payload['sequence_number']}:{payload['device_state']}:{payload['temperature']:.2f}:{payload['voltage']:.2f}"
    payload["checksum"] = format(zlib.crc32(payload_str.encode()) & 0xFFFFFFFF, '08X')
    response = client.post("/api/telemetry", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["packet_type"] == "VALID_PACKET"

    # Test invalid checksum
    invalid_payload = payload.copy()
    invalid_payload["checksum"] = "DEADBEEF"
    response = client.post("/api/telemetry", json=invalid_payload)
    assert response.status_code == 400

def test_fault_injection():
    # Test valid fault
    payload = {"fault_type": "GNSS_LOSS"}
    response = client.post("/api/faults/inject", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["fault_injected"] == "GNSS_LOSS"
    assert data["recovery_mode"] == "INS Dead-Reckoning Only"

    # Test unknown fault
    payload = {"fault_type": "UNKNOWN_FAULT"}
    response = client.post("/api/faults/inject", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["logged_event"] == "ERR_UNKNOWN"

def test_api_jobs_latest():
    response = client.get("/api/jobs/latest")
    assert response.status_code in [200, 404]
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "success":
            assert "job_id" in data
            assert "cep_guided_50" in data

def test_api_validation_summary():
    response = client.get("/api/validation/summary")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert "status_counts" in data.get("data", {})

def test_api_requirements():
    response = client.get("/api/requirements")
    assert response.status_code == 200
    data = response.json()
    reqs = data.get("data", [])
    assert isinstance(reqs, list)
    if len(reqs) > 0:
        req_id = reqs[0]["id"]
        res_single = client.get(f"/api/requirements/{req_id}")
        assert res_single.status_code == 200
        single_data = res_single.json().get("data", {})
        assert single_data["id"] == req_id
        assert "evidence" in single_data

def test_provenance_and_reproducibility():
    """
    Tests that jobs correctly capture their configuration snapshot,
    generate a result hash, and are perfectly reproducible given the same seed.
    """
    # 1. Run Job A
    payload_a = {
        "runs": 25,
        "target_distance": 20000.0,
        "launch_elevation_deg": 45.0,
        "random_seed": 424242
    }
    res_a = client.post("/api/jobs", json=payload_a)
    assert res_a.status_code == 200
    
    # Get Latest (Job A)
    res_latest_a = client.get("/api/jobs/latest")
    assert res_latest_a.status_code == 200
    data_a = res_latest_a.json()
    assert "configuration_snapshot" in data_a
    assert "result_hash" in data_a
    
    hash_a = data_a["result_hash"]
    assert hash_a is not None and hash_a != ""
    
    # 2. Run Job B (Identical config)
    res_b = client.post("/api/jobs", json=payload_a)
    assert res_b.status_code == 200
    
    # Get Latest (Job B)
    res_latest_b = client.get("/api/jobs/latest")
    assert res_latest_b.status_code == 200
    data_b = res_latest_b.json()
    
    hash_b = data_b["result_hash"]
    assert hash_b is not None and hash_b != ""
    
    # 3. Assert Reproducibility (Hashes must match)
    assert hash_a == hash_b
    
    # 4. Assert Provenance metadata
    assert data_a["configuration_snapshot"]["random_seed"] == 424242

def test_unit_conversion_target_distance():
    import models
    from database import SessionLocal
    # Submit job with 20000 m target distance
    payload = {
        "runs": 10,
        "target_distance": 20000.0,
        "launch_elevation_deg": 45.0,
        "random_seed": 123
    }
    res = client.post("/api/jobs", json=payload)
    assert res.status_code == 200
    
    # Verify in DB
    db = SessionLocal()
    tr = db.query(models.TestRun).order_by(models.TestRun.id.desc()).first()
    assert "Range=20.0km" in tr.objective
    db.close()
