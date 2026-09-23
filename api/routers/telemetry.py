import json
import uuid
import zlib

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from api.schemas import TelemetryPacket
from database import get_db

router = APIRouter(tags=["Telemetry & Navigation"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                dead_connections.append(connection)
            except RuntimeError:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()
latest_telemetry_packet = None

class TelemetrySessionRequest(BaseModel):
    device_id: str
    mode: str
    software_version: str
    is_simulated: bool = True

@router.post("/telemetry/sessions", summary="Create Telemetry Session")
async def create_session(req: TelemetrySessionRequest, db: Session = Depends(get_db)):
    """Creates a new telemetry session."""
    session_id = f"SESS-{uuid.uuid4().hex[:8].upper()}"
    session_record = models.TelemetrySession(
        session_id=session_id,
        device_id=req.device_id,
        mode=req.mode,
        software_version=req.software_version,
        is_simulated=req.is_simulated
    )
    db.add(session_record)
    db.commit()
    return {"status": "success", "session_id": session_id}

@router.post("/telemetry", summary="Post Telemetry Data")
async def post_telemetry(packet: TelemetryPacket, db: Session = Depends(get_db)):
    """
    Receives hardware telemetry, validates session_id and checksum,
    broadcasts via WebSocket, and persists.

    NOTE: This system operates in TELEMETRY SIMULATION / SOFTWARE-IN-THE-LOOP
    mode until physical hardware (MCU/IMU board) is connected.
    """
    global latest_telemetry_packet

    # --- P1-09: Verify session_id exists before accepting packet ---
    session_record = db.query(models.TelemetrySession).filter_by(
        session_id=packet.session_id
    ).first()
    if not session_record:
        event = models.SystemEvent(
            event_type="TELEMETRY_INVALID_SESSION",
            details=f"Unknown session_id '{packet.session_id}' in seq {packet.sequence_number}"
        )
        db.add(event)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Unknown session_id '{packet.session_id}'. Create a session first via POST /api/telemetry/sessions"
        )

    # --- P1-10: Checksum validation using CRC32 on a deterministic string of the packet ---
    payload_str = f"{packet.session_id}:{packet.sequence_number}:{packet.device_state}:{packet.temperature:.2f}:{packet.voltage:.2f}"
    expected_crc = format(zlib.crc32(payload_str.encode()) & 0xFFFFFFFF, '08X')

    if packet.checksum != expected_crc:
        event = models.SystemEvent(
            event_type="INVALID_PACKET",
            details=f"session={packet.session_id} seq={packet.sequence_number} expected={expected_crc} got={packet.checksum}"
        )
        db.add(event)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Checksum mismatch. Expected {expected_crc}")

    # Record valid packet event
    valid_event = models.SystemEvent(
        event_type="VALID_PACKET",
        details=f"session={packet.session_id} seq={packet.sequence_number}"
    )
    db.add(valid_event)

    sample = models.TelemetrySample(
        session_id=session_record.id,
        timestamp_ms=int(packet.timestamp.timestamp() * 1000),
        accel_x=packet.accelerometer[0],
        accel_y=packet.accelerometer[1],
        accel_z=packet.accelerometer[2],
        gyro_x=packet.gyroscope[0],
        gyro_y=packet.gyroscope[1],
        gyro_z=packet.gyroscope[2],
        temperature=packet.temperature,
        voltage=packet.voltage,
        current=packet.current,
        device_state=packet.device_state,
        sequence_number=packet.sequence_number,
        checksum=packet.checksum
    )
    db.add(sample)
    db.commit()

    packet_dict = packet.model_dump()
    packet_dict["timestamp"] = packet.timestamp.isoformat()
    # P1-11: Label as simulation if the session is simulated
    packet_dict["_telemetry_mode"] = "TELEMETRY SIMULATION / SOFTWARE-IN-THE-LOOP" if session_record.is_simulated else "HARDWARE"
    latest_telemetry_packet = packet_dict

    await manager.broadcast(packet_dict)

    return {"status": "success", "recorded_bytes": len(json.dumps(packet_dict)), "packet_type": "VALID_PACKET"}

@router.get("/telemetry", summary="Get Latest Telemetry")
async def get_telemetry():
    """Returns the latest telemetry frame."""
    if latest_telemetry_packet:
        return latest_telemetry_packet
    return {"status": "no_data"}

@router.websocket("/telemetry/stream")
async def telemetry_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
