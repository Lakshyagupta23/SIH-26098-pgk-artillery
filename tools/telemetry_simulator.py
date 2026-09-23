import datetime
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import zlib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import version

# Deterministic hardware simulator (P3-24)
random.seed(428193)

BASE_URL = "http://localhost:8000/api/telemetry"

def generate_packet(seq: int, mode: str):
    """Generates a deterministic telemetry packet based on the selected fault mode."""
    
    # Base nominal values
    temp = 25.0 + random.uniform(-1.0, 1.0)
    volt = 5.0 + random.uniform(-0.05, 0.05)
    curr = 1.2 + random.uniform(-0.1, 0.1)
    accel = [0.0, 0.0, -9.81]
    gyro = [0.0, 0.0, 0.0]
    state = "NORMAL"

    if mode == "DEGRADED":
        state = "DEGRADED"
        volt -= 0.5
    elif mode == "SENSOR_FAULT":
        state = "FAULT_IMU"
        accel = [999.9, 999.9, 999.9]
    elif mode == "POWER_DEGRADED":
        state = "POWER_WARN"
        volt = 4.1
        curr = 2.5
    elif mode == "NAVIGATION_DEGRADED":
        state = "NAV_DEGRADED"
        gyro = [random.uniform(-50, 50) for _ in range(3)]
        
    packet = {
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
        "accelerometer": accel,
        "gyroscope": gyro,
        "temperature": round(temp, 2),
        "voltage": round(volt, 2),
        "current": round(curr, 2),
        "device_state": state,
        "sequence_number": seq,
        "checksum": ""
    }
    
    # Calculate CRC32 checksum to match backend logic
    payload_str = f"{packet['sequence_number']}:{packet['device_state']}:{packet['temperature']:.2f}:{packet['voltage']:.2f}"
    packet["checksum"] = format(zlib.crc32(payload_str.encode()) & 0xFFFFFFFF, '08X')
    
    return packet

def create_session(mode: str):
    """Create a telemetry session."""
    session_data = {
        "device_id": "SIM-HW-001",
        "mode": mode,
        "software_version": version.SYSTEM_VERSION
    }
    req = urllib.request.Request(f"{BASE_URL}/sessions", data=json.dumps(session_data).encode(), headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
        print(f"[Simulator] Started session with mode: {mode}")
    except urllib.error.URLError as e:
        print(f"[Simulator] Could not connect to backend: {e}")

def run_simulation(mode: str, duration_sec: int = 10, rate_hz: int = 5):
    """Runs the deterministic telemetry loop."""
    print(f"\n--- Starting Telemetry Simulator (Mode: {mode}) ---")
    create_session(mode)
    
    seq = 0
    end_time = time.time() + duration_sec
    delay = 1.0 / rate_hz
    
    while time.time() < end_time:
        if mode == "PACKET_LOSS" and random.random() < 0.3:
            print(f"[Simulator] PACKET_LOSS: Dropped sequence {seq}")
            seq += 1
            time.sleep(delay)
            continue
            
        packet = generate_packet(seq, mode)
        req = urllib.request.Request(BASE_URL, data=json.dumps(packet).encode(), headers={'Content-Type': 'application/json'})
        
        try:
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                    print(f"Sent Seq {seq:04d} | State: {packet['device_state']:<12} | CRC: {packet['checksum']}")
        except urllib.error.HTTPError as e:
            print(f"Failed Seq {seq:04d} | HTTP {e.code}: {e.read().decode()}")
        except urllib.error.URLError as e:
            print(f"Connection Error: {e.reason}")
            break
            
        seq += 1
        time.sleep(delay)

if __name__ == "__main__":
    modes = ["NORMAL", "DEGRADED", "SENSOR_FAULT", "PACKET_LOSS", "POWER_DEGRADED", "NAVIGATION_DEGRADED"]
    print("Available Modes:", ", ".join(modes))
    
    # Run a short nominal test by default
    run_simulation("NORMAL", duration_sec=5, rate_hz=2)
    # run_simulation("SENSOR_FAULT", duration_sec=3, rate_hz=2)
