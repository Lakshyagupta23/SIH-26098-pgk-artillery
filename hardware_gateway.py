import datetime
import random
import sys
import time

import requests

API_URL = "http://127.0.0.1:8000/api/telemetry"

import zlib


def compute_checksum(session_id, seq, state, temp, volt):
    """CRC32 checksum of critical payload fields."""
    payload_str = f"{session_id}:{seq}:{state}:{temp:.2f}:{volt:.2f}"
    return format(zlib.crc32(payload_str.encode()) & 0xFFFFFFFF, '08X')

def run_mock_gateway(frequency_hz=10):
    print(f"Starting hardware gateway. Sending telemetry at {frequency_hz} Hz...")
    # Create session first
    session_payload = {
        "device_id": "HW-SIM-001",
        "mode": "TEST",
        "software_version": "2.2.0",
        "is_simulated": True
    }
    try:
        session_resp = requests.post("http://127.0.0.1:8000/api/telemetry/sessions", json=session_payload, timeout=2.0)
        session_resp.raise_for_status()
        session_id = session_resp.json()["session_id"]
        print(f"Created telemetry session: {session_id}")
    except Exception as e:
        print(f"Failed to create session: {e}")
        sys.exit(1)

    seq = 0
    
    # Base states
    state = "SAFE"
    states = ["SAFE", "ARMED", "IN_FLIGHT", "TERMINAL"]
    
    while True:
        try:
            # Change state occasionally just for visual change
            if seq % 100 == 0:
                state = random.choice(states)

            # Generate mock physics values
            # Slight random walk
            accel = [
                random.gauss(0, 0.5), 
                random.gauss(0.5, 0.1), 
                random.gauss(-9.8, 0.2)
            ]
            gyro = [
                random.gauss(0, 0.1), 
                random.gauss(260.0, 5.0), # spin
                random.gauss(0, 0.1)
            ]
            
            payload = {
                "session_id": session_id,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
                "accelerometer": accel,
                "gyroscope": gyro,
                "temperature": 25.0 + random.gauss(0, 1.0),
                "voltage": 12.0 + random.gauss(0, 0.05),
                "current": 1.5 + random.gauss(0, 0.1),
                "device_state": state,
                "sequence_number": seq
            }
            
            payload["checksum"] = compute_checksum(session_id, seq, payload["device_state"], payload["temperature"], payload["voltage"])
            
            resp = requests.post(API_URL, json=payload, timeout=2.0)
            if resp.status_code == 200:
                print(f"[SEQ {seq}] Sent telemetry frame -> {payload['checksum']}")
            else:
                print(f"[SEQ {seq}] Error {resp.status_code}: {resp.text}")
                
        except requests.exceptions.ConnectionError:
            print(f"[SEQ {seq}] Connection refused. Is the API running on {API_URL}?")
        except Exception as e:
            print(f"Unexpected error: {e}")
            
        seq += 1
        time.sleep(1.0 / frequency_hz)

if __name__ == "__main__":
    try:
        run_mock_gateway()
    except KeyboardInterrupt:
        print("Hardware gateway stopped.")
        sys.exit(0)
