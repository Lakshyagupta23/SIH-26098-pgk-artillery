from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

def test_inject_fault_gnss_loss():
    response = client.post("/api/faults/inject", json={"fault_type": "GNSS_LOSS"})
    assert response.status_code == 200
    data = response.json()
    assert data["fault_injected"] == "GNSS_LOSS"
    assert data["logged_event"] == "WARN_NAV_GNSS_TIMEOUT"

def test_inject_fault_sensor_bias():
    response = client.post("/api/faults/inject", json={"fault_type": "SENSOR_BIAS"})
    assert response.status_code == 200
    data = response.json()
    assert data["fault_injected"] == "SENSOR_BIAS"
    assert data["logged_event"] == "WARN_SENSOR_IMU_BIAS"

def test_inject_fault_power_brownout():
    response = client.post("/api/faults/inject", json={"fault_type": "POWER_BROWNOUT"})
    assert response.status_code == 200
    data = response.json()
    assert data["fault_injected"] == "POWER_BROWNOUT"
    assert data["logged_event"] == "ERR_PWR_BROWNOUT"

def test_inject_fault_unknown():
    response = client.post("/api/faults/inject", json={"fault_type": "UNKNOWN_FAULT"})
    assert response.status_code == 200
    data = response.json()
    assert data["fault_injected"] == "UNKNOWN_FAULT"
    assert data["logged_event"] == "ERR_UNKNOWN"
