export class FaultLabModule {
    constructor() {
        this.faultButtons = document.querySelectorAll('.btn-fault');
        this.clearBtn = document.getElementById('btn-clear-faults');
        this.logBody = document.getElementById('fault-log-body');
        
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                if (this.logBody) this.logBody.innerHTML = '';
            });
        }
        
        this.faultButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const faultType = e.target.getAttribute('data-fault');
                this.injectFault(faultType);
            });
        });
    }

    async injectFault(faultType) {
        try {
            const response = await fetch('/api/faults/inject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fault_type: faultType })
            });

            if (!response.ok) {
                console.error('Failed to inject fault');
                return;
            }

            const data = await response.json();
            this.appendLog(data);
        } catch (error) {
            console.error('Error injecting fault:', error);
        }
    }

    appendLog(data) {
        if (!this.logBody) return;

        const timeString = new Date().toLocaleTimeString();
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        // Highlight critical errors in orange, warnings in yellow
        let rowColor = 'var(--text-primary)';
        if (data.logged_event.startsWith('ERR_')) {
            rowColor = 'var(--accent-orange)';
        } else if (data.logged_event.startsWith('WARN_')) {
            rowColor = 'var(--accent-amber)';
        }

        tr.innerHTML = `
            <td style="padding: 0.75rem; color: var(--text-dim);">${timeString}</td>
            <td style="padding: 0.75rem; color: ${rowColor}; font-weight: bold;">${data.fault_injected}</td>
            <td style="padding: 0.75rem;">${data.detection}</td>
            <td style="padding: 0.75rem;">${data.system_response}</td>
            <td style="padding: 0.75rem; color: var(--tactical-green);">${data.recovery_mode}</td>
            <td style="padding: 0.75rem; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">${data.logged_event}</td>
        `;

        this.logBody.prepend(tr);
    }
}
