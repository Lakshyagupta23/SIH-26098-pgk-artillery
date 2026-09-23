from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

def test_api_contract_bom_power():
    response = client.get("/api/bom")
    assert response.status_code == 200
    assert "data" in response.json()
    assert response.json()["status"] == "success"
    
    response = client.get("/api/power")
    assert response.status_code == 200
    assert "data" in response.json()
    assert response.json()["status"] == "success"

def test_invalid_lat_long():
    invalid_payload = {
        "runs": 10,
        "target_distance": 20000.0,
        "launch_elevation_deg": 45.0,
        "latitude_deg": 100.0 # Invalid
    }
    response = client.post("/api/jobs", json=invalid_payload)
    assert response.status_code == 422
    
def test_replay_simulation():
    # Run a job
    payload = {
        "runs": 10,
        "target_distance": 20000.0,
        "launch_elevation_deg": 45.0,
        "random_seed": 555
    }
    res_a = client.post("/api/jobs", json=payload)
    assert res_a.status_code == 200
    
    res_latest = client.get("/api/jobs/latest")
    assert res_latest.status_code == 200
    job_id = res_latest.json()["job_id"]
    hash_a = res_latest.json()["result_hash"]
    
    # Replay it — response now includes original provenance
    res_replay = client.post(f"/api/jobs/{job_id}/replay")
    assert res_replay.status_code == 200
    replay_data = res_replay.json()
    assert replay_data.get("replay_type") == "parameter_snapshot_replay"
    assert replay_data.get("original_job_id") == job_id
    new_job_id = replay_data["job_id"]
    
    # Fetch the replayed job's result
    res_b = client.get("/api/jobs/latest")
    assert res_b.status_code == 200
    hash_b = res_b.json()["result_hash"]
    
    # Same seed + same config should produce the same result hash
    assert hash_a == hash_b

def test_provenance():
    res = client.get("/api/jobs/latest")
    assert res.status_code == 200
    data = res.json()
    assert "provenance" in data
    prov = data["provenance"]
    assert "value" in prov
    assert "source" in prov
    assert "status" in prov
    assert "model_version" in prov
    assert "config_version" in prov
    assert "timestamp" in prov

def test_configuration_snapshot_complete():
    """Verify the canonical configuration snapshot includes all engineering modules."""
    payload = {
        "runs": 10,
        "target_distance": 15000.0,
        "launch_elevation_deg": 45.0,
        "random_seed": 42
    }
    res = client.post("/api/jobs", json=payload)
    assert res.status_code == 200, f"Job POST failed: {res.json()}"

    res_latest = client.get("/api/jobs/latest")
    assert res_latest.status_code == 200
    snap = res_latest.json().get("configuration_snapshot")
    assert snap is not None, "configuration_snapshot must be stored"

    # Verify all canonical config modules are present
    for key in ("system_config", "simulation_config", "hardware_config", "power_config", "bom_config", "versions"):
        assert key in snap, f"Missing key in configuration_snapshot: {key}"

    # Verify versions block is complete
    versions = snap["versions"]
    for vkey in ("system_version", "frontend_version", "backend_version", "physics_version",
                 "config_version", "hardware_revision", "cad_revision"):
        assert vkey in versions, f"Missing version field: {vkey}"

    # Verify simulation parameters are preserved
    assert "simulation_parameters" in snap
    assert "random_seed" in snap
