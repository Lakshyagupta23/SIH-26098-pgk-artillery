// ============================================================
// AEGIS-155: Hardware Telemetry Module (Web Serial API & WebSocket)
// ============================================================

export class TelemetryModule {
    constructor() {
        // Serial (Web Serial API) state
        this.port = null;
        this.reader = null;
        this.keepReading = false;
        this.readableStreamClosed = null;

        // WebSocket state
        this.ws = null;

        // Metrics tracking
        this.packetCount = 0;
        this.lastSecondPacketCount = 0;
        this.hzInterval = null;
        this.accel = { x: 0, y: 0, z: 9.81 };
        this.gyro = { x: 0, y: 0, z: 0 };
        this.pitch = 0;
        this.roll = 0;
        this.temperature = 25.0;
        this.pressure = 1013.25;

        // DOM elements
        this.btnConnectUsb = document.getElementById('btn-connect-usb');
        this.btnDisconnectUsb = document.getElementById('btn-disconnect-usb');
        this.baudSelect = document.getElementById('serial-baud-rate');
        this.statusBadge = document.getElementById('usb-status');

        this.btnConnectWs = document.getElementById('btn-connect-ws');
        this.btnDisconnectWs = document.getElementById('btn-disconnect-ws');

        this.logEl = document.getElementById('telemetry-log');
        this.btnClearLog = document.getElementById('btn-clear-telemetry-log');

        // Metric DOM elements
        this.valNetG = document.getElementById('val-net-g');
        this.valAccelX = document.getElementById('val-accel-x');
        this.valAccelY = document.getElementById('val-accel-y');
        this.valAccelZ = document.getElementById('val-accel-z');
        this.valPitchRoll = document.getElementById('val-pitch-roll');

        this.valBmpPressure = document.getElementById('val-bmp-pressure');
        this.valBmpTemp = document.getElementById('val-bmp-temp');
        this.valBmpAlt = document.getElementById('val-bmp-alt');
        this.valBmpDensity = document.getElementById('val-bmp-density');

        this.valGpsStatus = document.getElementById('val-gps-status');
        this.valGpsSats = document.getElementById('val-gps-sats');
        this.valGpsLat = document.getElementById('val-gps-lat');
        this.valGpsLon = document.getElementById('val-gps-lon');

        this.valPacketCount = document.getElementById('val-packet-count');
        this.valStreamHz = document.getElementById('val-stream-hz');

        this.attitudeCanvas = document.getElementById('canvas-attitude');
        this.attitudeCtx = this.attitudeCanvas ? this.attitudeCanvas.getContext('2d') : null;

        this.initEventListeners();
        this.startHzCounter();
        this.drawAttitudeIndicator(0, 0);
    }

    initEventListeners() {
        if (this.btnConnectUsb) {
            this.btnConnectUsb.addEventListener('click', () => this.connectUsb());
        }
        if (this.btnDisconnectUsb) {
            this.btnDisconnectUsb.addEventListener('click', () => this.disconnectUsb());
        }
        if (this.btnConnectWs) {
            this.btnConnectWs.addEventListener('click', () => this.connectWs());
        }
        if (this.btnDisconnectWs) {
            this.btnDisconnectWs.addEventListener('click', () => this.disconnectWs());
        }
        if (this.btnClearLog) {
            this.btnClearLog.addEventListener('click', () => {
                if (this.logEl) this.logEl.textContent = '';
            });
        }
    }

    startHzCounter() {
        this.hzInterval = setInterval(() => {
            const hz = this.packetCount - this.lastSecondPacketCount;
            this.lastSecondPacketCount = this.packetCount;
            if (this.valStreamHz) {
                this.valStreamHz.textContent = `${hz} Hz`;
            }
        }, 1000);
    }

    // ============================================================
    // WEB SERIAL API (Direct USB connection from Chrome/Edge)
    // ============================================================
    async connectUsb() {
        if (!('serial' in navigator)) {
            alert('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera to connect directly via USB.');
            return;
        }

        try {
            const baudRate = this.baudSelect ? parseInt(this.baudSelect.value, 10) : 115200;
            this.log(`[SERIAL] Requesting USB device access at ${baudRate} baud...`);

            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate });

            this.keepReading = true;
            this.updateStatus(true, `Connected (USB ${baudRate} baud)`);

            if (this.btnConnectUsb) this.btnConnectUsb.style.display = 'none';
            if (this.btnDisconnectUsb) this.btnDisconnectUsb.style.display = 'inline-flex';

            this.log(`[SERIAL] Port opened successfully at ${baudRate} baud. Reading serial stream...`);

            // Read the serial stream using TextDecoderStream and line splitting
            this.readSerialStream();
        } catch (err) {
            console.error('Serial connection error:', err);
            this.updateStatus(false, `Error: ${err.message || 'Connection failed'}`);
            this.log(`[ERROR] ${err.message || 'Failed to open USB port.'}`);
        }
    }

    async readSerialStream() {
        while (this.port && this.port.readable && this.keepReading) {
            const textDecoder = new TextDecoderStream();
            this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();

            let lineBuffer = '';

            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) break;

                    lineBuffer += value;
                    const lines = lineBuffer.split(/\r?\n/);
                    lineBuffer = lines.pop(); // Keep partial line in buffer

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) {
                            this.packetCount++;
                            if (this.valPacketCount) {
                                this.valPacketCount.textContent = this.packetCount.toString();
                            }
                            this.log(trimmed);
                            this.parseLine(trimmed);
                        }
                    }
                }
            } catch (error) {
                console.warn('Serial read loop error:', error);
            } finally {
                this.reader.releaseLock();
            }
        }
    }

    async disconnectUsb() {
        this.keepReading = false;
        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch (e) {
                // Ignore cancel error
            }
        }
        if (this.port) {
            try {
                await this.port.close();
            } catch (e) {
                console.error('Error closing port:', e);
            }
            this.port = null;
        }

        this.updateStatus(false, 'Status: USB Disconnected');
        if (this.btnConnectUsb) this.btnConnectUsb.style.display = 'inline-flex';
        if (this.btnDisconnectUsb) this.btnDisconnectUsb.style.display = 'none';
        this.log('[SERIAL] USB port disconnected.');
    }

    // ============================================================
    // LINE PARSER FOR ARDUINO FORMAT
    // ============================================================
    parseLine(line) {
        // Format 1: [MPU] Accel X: -4.60 m/s^2 (or Y, Z / Gyro)
        if (line.includes('[MPU]')) {
            const matchAccelX = line.match(/(?:Accel\s*X|aX|X)\s*[:=]\s*([-\d.]+)/i);
            const matchAccelY = line.match(/(?:Accel\s*Y|aY|Y)\s*[:=]\s*([-\d.]+)/i);
            const matchAccelZ = line.match(/(?:Accel\s*Z|aZ|Z)\s*[:=]\s*([-\d.]+)/i);

            const matchGyroX = line.match(/(?:Gyro\s*X|gX)\s*[:=]\s*([-\d.]+)/i);
            const matchGyroY = line.match(/(?:Gyro\s*Y|gY)\s*[:=]\s*([-\d.]+)/i);
            const matchGyroZ = line.match(/(?:Gyro\s*Z|gZ)\s*[:=]\s*([-\d.]+)/i);

            if (matchAccelX) this.accel.x = parseFloat(matchAccelX[1]);
            if (matchAccelY) this.accel.y = parseFloat(matchAccelY[1]);
            if (matchAccelZ) this.accel.z = parseFloat(matchAccelZ[1]);

            if (matchGyroX) this.gyro.x = parseFloat(matchGyroX[1]);
            if (matchGyroY) this.gyro.y = parseFloat(matchGyroY[1]);
            if (matchGyroZ) this.gyro.z = parseFloat(matchGyroZ[1]);

            this.updateMpuMetrics();
            return;
        }

        // Format 2: [BMP] Temp: 29.34 C | Pressure: 986.16 hPa
        if (line.includes('[BMP]')) {
            const matchTemp = line.match(/(?:Temp(?:erature)?|T)\s*[:=]\s*([-\d.]+)/i);
            const matchPressure = line.match(/(?:Press(?:ure)?|P)\s*[:=]\s*([-\d.]+)/i);

            if (matchTemp) this.temperature = parseFloat(matchTemp[1]);
            if (matchPressure) this.pressure = parseFloat(matchPressure[1]);

            this.updateBmpMetrics();
            return;
        }

        // Format 3: [GPS] Waiting for satellite fix... or GPS coordinates
        if (line.includes('[GPS]')) {
            if (line.includes('Waiting for satellite fix') || line.includes('Searching') || line.includes('No fix')) {
                if (this.valGpsStatus) {
                    this.valGpsStatus.textContent = 'Searching for Satellites...';
                    this.valGpsStatus.style.color = 'var(--op-amber)';
                }
                if (this.valGpsSats) this.valGpsSats.textContent = '0 Sats';
            } else {
                const matchLat = line.match(/(?:Lat(?:itude)?)\s*[:=]\s*([-\d.]+)/i);
                const matchLon = line.match(/(?:Lon(?:gitude)?)\s*[:=]\s*([-\d.]+)/i);
                const matchSats = line.match(/(?:Sats?|Satellites?)\s*[:=]\s*(\d+)/i);

                if (this.valGpsStatus) {
                    this.valGpsStatus.textContent = '3D Fix Acquired (NavIC/GPS)';
                    this.valGpsStatus.style.color = 'var(--op-green)';
                }
                if (matchLat && this.valGpsLat) this.valGpsLat.textContent = matchLat[1];
                if (matchLon && this.valGpsLon) this.valGpsLon.textContent = matchLon[1];
                if (matchSats && this.valGpsSats) this.valGpsSats.textContent = `${matchSats[1]} Sats`;
            }
            return;
        }

        // Fallback: JSON format
        if (line.startsWith('{') && line.endsWith('}')) {
            try {
                const data = JSON.parse(line);
                if (data.accelerometer) {
                    this.accel.x = data.accelerometer[0];
                    this.accel.y = data.accelerometer[1];
                    this.accel.z = data.accelerometer[2];
                    this.updateMpuMetrics();
                }
                if (data.temperature) {
                    this.temperature = data.temperature;
                    this.updateBmpMetrics();
                }
                if (data.pressure) {
                    this.pressure = data.pressure;
                    this.updateBmpMetrics();
                }
            } catch (e) {
                // Not valid JSON
            }
        }
    }

    updateMpuMetrics() {
        const ax = this.accel.x;
        const ay = this.accel.y;
        const az = this.accel.z;

        if (this.valAccelX) this.valAccelX.textContent = `${ax.toFixed(2)} m/s²`;
        if (this.valAccelY) this.valAccelY.textContent = `${ay.toFixed(2)} m/s²`;
        if (this.valAccelZ) this.valAccelZ.textContent = `${az.toFixed(2)} m/s²`;

        // Calculate Net G-Force
        const gNet = Math.sqrt(ax * ax + ay * ay + az * az) / 9.80665;
        if (this.valNetG) this.valNetG.textContent = gNet.toFixed(2);

        // Derive Pitch & Roll angles from gravity vector
        this.pitch = Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);
        this.roll = Math.atan2(ay, az) * (180 / Math.PI);

        if (this.valPitchRoll) {
            this.valPitchRoll.textContent = `${this.pitch.toFixed(1)}° / ${this.roll.toFixed(1)}°`;
        }

        // Redraw attitude horizon
        this.drawAttitudeIndicator(this.pitch, this.roll);
    }

    updateBmpMetrics() {
        if (this.valBmpTemp) this.valBmpTemp.textContent = `${this.temperature.toFixed(1)} °C`;
        if (this.valBmpPressure) this.valBmpPressure.textContent = this.pressure.toFixed(1);

        // Barometric formula for altitude AGL (assuming QNH 1013.25 hPa)
        const alt = 44330.0 * (1.0 - Math.pow(this.pressure / 1013.25, 0.190284));
        if (this.valBmpAlt) this.valBmpAlt.textContent = `${alt.toFixed(1)} m`;

        // Air density rho = P / (R * T)
        const T_kelvin = this.temperature + 273.15;
        const rho = (this.pressure * 100.0) / (287.05 * T_kelvin);
        if (this.valBmpDensity) this.valBmpDensity.textContent = `${rho.toFixed(3)} kg/m³`;
    }

    // ============================================================
    // ATTITUDE HORIZON INDICATOR (Canvas 2D)
    // ============================================================
    drawAttitudeIndicator(pitchDeg, rollDeg) {
        if (!this.attitudeCtx || !this.attitudeCanvas) return;
        const ctx = this.attitudeCtx;
        const w = this.attitudeCanvas.width;
        const h = this.attitudeCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = w / 2;

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // Circular clipping region
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.clip();

        // Sky & Ground rotation
        ctx.translate(cx, cy);
        ctx.rotate((-rollDeg * Math.PI) / 180);

        const pitchOffset = Math.max(-r, Math.min(r, (pitchDeg / 45) * (r * 0.75)));
        ctx.translate(0, pitchOffset);

        // Sky (Deep Blue/Slate)
        ctx.fillStyle = '#0f2942';
        ctx.fillRect(-w, -h * 2, w * 2, h * 2);

        // Ground (Warm Amber/Earth)
        ctx.fillStyle = '#4a2c11';
        ctx.fillRect(-w, 0, w * 2, h * 2);

        // Horizon line
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();

        // Pitch ladder lines (+10, +20, -10, -20)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        const step = (10 / 45) * (r * 0.75);
        for (let i = 1; i <= 3; i++) {
            // Above horizon
            ctx.beginPath();
            ctx.moveTo(-15, -i * step);
            ctx.lineTo(15, -i * step);
            ctx.stroke();
            // Below horizon
            ctx.beginPath();
            ctx.moveTo(-15, i * step);
            ctx.lineTo(15, i * step);
            ctx.stroke();
        }

        ctx.restore();

        // Fixed Aircraft / Projectile Reticle (Center crosshair)
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();

        // Left wing
        ctx.beginPath();
        ctx.moveTo(cx - 24, cy);
        ctx.lineTo(cx - 8, cy);
        ctx.lineTo(cx - 8, cy + 4);
        ctx.stroke();

        // Right wing
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy + 4);
        ctx.lineTo(cx + 8, cy);
        ctx.lineTo(cx + 24, cy);
        ctx.stroke();

        ctx.restore();
    }

    updateStatus(connected, text) {
        if (!this.statusBadge) return;
        this.statusBadge.textContent = text;
        if (connected) {
            this.statusBadge.classList.add('connected');
            this.statusBadge.classList.remove('error');
        } else {
            this.statusBadge.classList.remove('connected');
        }
    }

    log(message) {
        if (!this.logEl) return;
        if (this.logEl.textContent.startsWith('Waiting for serial')) {
            this.logEl.textContent = '';
        }
        const timeStr = new Date().toISOString().substring(11, 19);
        const line = `[${timeStr}] ${message}\n`;
        this.logEl.textContent += line;

        // Auto-scroll
        this.logEl.scrollTop = this.logEl.scrollHeight;

        // Keep last 150 lines
        const lines = this.logEl.textContent.split('\n');
        if (lines.length > 150) {
            this.logEl.textContent = lines.slice(-150).join('\n');
        }
    }

    // ============================================================
    // WEBSOCKET FALLBACK (For remote or networked gateways)
    // ============================================================
    connectWs() {
        if (this.ws) this.ws.close();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/telemetry/stream`;

        this.log(`[WS] Connecting to ${wsUrl}...`);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateStatus(true, 'Connected (WebSocket)');
            if (this.btnConnectWs) this.btnConnectWs.style.display = 'none';
            if (this.btnDisconnectWs) this.btnDisconnectWs.style.display = 'inline-flex';
            this.log('[WS] Connected to backend telemetry stream.');
        };

        this.ws.onmessage = (event) => {
            try {
                this.packetCount++;
                if (this.valPacketCount) this.valPacketCount.textContent = this.packetCount.toString();
                this.log(event.data);
                this.parseLine(event.data);
            } catch (e) {
                this.log(event.data);
            }
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
            this.log('[WS] Error encountered.');
        };

        this.ws.onclose = () => {
            this.updateStatus(false, 'Status: Disconnected');
            if (this.btnConnectWs) this.btnConnectWs.style.display = 'inline-flex';
            if (this.btnDisconnectWs) this.btnDisconnectWs.style.display = 'none';
            this.log('[WS] Disconnected.');
            this.ws = null;
        };
    }

    disconnectWs() {
        if (this.ws) this.ws.close();
    }
}
