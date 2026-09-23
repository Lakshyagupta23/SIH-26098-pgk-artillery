from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

def test_get_hardware_config():
    response = client.get("/api/config/hardware")
    assert response.status_code == 200
    data = response.json()
    
    assert "actuator_max_deflection_deg" in data
    assert "actuator_max_slew_rate_deg_s" in data
    assert "nav_gain" in data
    assert "proximity_sensor_type" in data
    assert "proximity_sensor_frequency_display" in data
    assert "high_g_survivability_target" in data
    
    assert data["actuator_max_deflection_deg"] == 15.0
    assert data["actuator_max_slew_rate_deg_s"] == 60.0
