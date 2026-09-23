// Hardware Telemetry Module (WebSocket to backend API)
export class TelemetryModule {
    constructor() {
        this.ws = null;
        
        this.btnConnect = document.getElementById('btn-connect-ws');
        this.btnDisconnect = document.getElementById('btn-disconnect-ws');
        this.statusEl = document.getElementById('ws-status');
        this.logEl = document.getElementById('telemetry-log');
        this.mockBtn = document.getElementById('btn-mock-telemetry');
        
        if (this.btnConnect) {
            this.btnConnect.addEventListener('click', () => this.connect());
        }
        
        if (this.btnDisconnect) {
            this.btnDisconnect.addEventListener('click', () => this.disconnect());
        }

        if (this.mockBtn) {
            // Hide the old mock button since the backend script will handle it
            this.mockBtn.style.display = 'none';
        }
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/telemetry/stream`;
        
        this.log(`Connecting to ${wsUrl}...`);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.statusEl.textContent = 'Status: Connected to Telemetry Stream';
            this.statusEl.style.color = '#00ff66';
            this.btnConnect.style.display = 'none';
            this.btnDisconnect.style.display = 'block';
            this.log('WebSocket connected.');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.log(JSON.stringify(data));
                this.updateUI(data);
            } catch (e) {
                this.log(event.data);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
            this.log('WebSocket Error encountered.');
        };

        this.ws.onclose = () => {
            this.statusEl.textContent = 'Status: Disconnected';
            this.statusEl.style.color = 'var(--text-secondary)';
            this.btnConnect.style.display = 'block';
            this.btnDisconnect.style.display = 'none';
            this.log('WebSocket closed.');
            this.ws = null;
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    updateUI(packet) {
        // Look for existing UI elements to update
        const speedEl = document.getElementById('telem-speed');
        const gEl = document.getElementById('telem-g');
        const spinEl = document.getElementById('telem-spin');
        
        if (packet.accelerometer && gEl) {
            // Compute magnitude of acceleration in Gs (assuming packet is in m/s^2)
            const ax = packet.accelerometer[0];
            const ay = packet.accelerometer[1];
            const az = packet.accelerometer[2];
            const g = Math.sqrt(ax*ax + ay*ay + az*az) / 9.81;
            gEl.textContent = `${g.toFixed(1)} g`;
        }
        
        if (packet.gyroscope && spinEl) {
            // Assuming gyro Z is spin in rad/s, converting to RPM
            const spinRad = packet.gyroscope[1]; // y is spin in mock gateway
            const rpm = (spinRad * 60) / (2 * Math.PI);
            spinEl.textContent = `${Math.abs(rpm).toFixed(0)} RPM`;
        }
    }

    log(message) {
        if (!this.logEl) return;
        
        if (this.logEl.textContent === 'Waiting for data...') {
            this.logEl.textContent = '';
        }

        const span = document.createElement('span');
        span.textContent = message + '\n';
        this.logEl.appendChild(span);
        
        // Auto-scroll
        this.logEl.scrollTop = this.logEl.scrollHeight;
        
        // Trim log if too long (keep last 100 lines max)
        while (this.logEl.childNodes.length > 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }
    }
}

