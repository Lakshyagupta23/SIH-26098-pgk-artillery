// Engineering & Persistence Module (Backend Integrated)

export class EngineeringModule {
    constructor() {
        this.requirements = [];
        this.bom = [];
        
        this.fetchData();
        
        const resetBtn = document.getElementById('btn-reset-engineering');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                // Instead of resetting localStorage, we just re-fetch from the backend
                this.fetchData();
            });
        }
    }

    async fetchData() {
        try {
            const [reqRes, bomRes] = await Promise.all([
                fetch('/api/requirements'),
                fetch('/api/manufacturing/bom')
            ]);
            
            const reqData = await reqRes.json();
            const bomData = await bomRes.json();
            
            if (reqData.status === 'success') {
                this.requirements = reqData.data;
                this.renderRequirements();
            }
            
            if (bomData.status === 'success') {
                this.bom = bomData.bom.components;
                this.renderBOM(bomData.total_mass, bomData.total_power, bomData.total_cost);
            }
            
        } catch (e) {
            console.error("Failed to fetch engineering data from API", e);
        }
    }

    async updateRequirementStatus(reqId, newStatus) {
        try {
            const res = await fetch(`/api/requirements/${reqId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            if (!res.ok) {
                console.error("Failed to update requirement status");
            }
        } catch (e) {
            console.error("Error updating requirement status", e);
        }
    }

    renderRequirements() {
        const tbody = document.getElementById('requirements-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        this.requirements.forEach((req, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            let statusColor = 'var(--text-secondary)';
            const upperStatus = (req.status || '').toUpperCase();
            if (upperStatus === 'VALIDATED' || upperStatus === 'PASSED') statusColor = 'var(--accent-emerald)';
            if (upperStatus === 'SIMULATED') statusColor = 'var(--accent-cyan)';
            if (upperStatus === 'IN PROGRESS') statusColor = 'var(--accent-orange)';
            
            // Build a string for evidence
            const evidenceStr = (req.evidence && req.evidence.length > 0) 
                ? req.evidence.map(e => e.reference_id).join(', ') 
                : 'None';
                
            tr.innerHTML = `
                <td style="padding: 0.75rem; font-family: var(--font-mono); color: var(--text-primary);">${req.id}</td>
                <td style="padding: 0.75rem;">${req.name}</td>
                <td style="padding: 0.75rem;">
                    <select class="req-status-select" data-index="${index}" data-reqid="${req.id}" style="background: rgba(0,0,0,0.3); color: ${statusColor}; border: 1px solid var(--border-steel); padding: 0.25rem; border-radius: 4px;">
                        <option value="PENDING" ${upperStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
                        <option value="DESIGN ESTIMATE" ${upperStatus === 'DESIGN ESTIMATE' ? 'selected' : ''}>DESIGN ESTIMATE</option>
                        <option value="SIMULATED" ${upperStatus === 'SIMULATED' ? 'selected' : ''}>SIMULATED</option>
                        <option value="BENCH DEMONSTRATED" ${upperStatus === 'BENCH DEMONSTRATED' ? 'selected' : ''}>BENCH DEMONSTRATED</option>
                        <option value="VALIDATED" ${upperStatus === 'VALIDATED' ? 'selected' : ''}>VALIDATED</option>
                        <option value="PASSED" ${upperStatus === 'PASSED' ? 'selected' : ''}>PASSED</option>
                        <option value="FAILED" ${upperStatus === 'FAILED' ? 'selected' : ''}>FAILED</option>
                    </select>
                </td>
                <td style="padding: 0.75rem; font-family: var(--font-mono); font-size: 0.75rem;">${evidenceStr}</td>
            `;
            tbody.appendChild(tr);
        });

        // Add event listeners for selects
        document.querySelectorAll('.req-status-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                const reqId = e.target.getAttribute('data-reqid');
                const newStatus = e.target.value;
                
                this.requirements[idx].status = newStatus;
                this.updateRequirementStatus(reqId, newStatus);
                this.renderRequirements(); // re-render to update colors
            });
        });
    }

    renderBOM(totalMass, totalPower, totalCost) {
        const tbody = document.getElementById('bom-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        this.bom.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            // The item has representative_part, mass_g, power_mw, unit_cost
            const mass = item.mass_g || 0;
            const power = item.power_mw || 0;
            const cost = item.unit_cost || 0;
            const name = item.representative_part || item.component_id;
            
            tr.innerHTML = `
                <td style="padding: 0.75rem; color: var(--text-primary);">${name}</td>
                <td style="padding: 0.75rem; font-family: var(--font-mono);">${mass.toFixed(1)}</td>
                <td style="padding: 0.75rem; font-family: var(--font-mono);">${power.toFixed(1)}</td>
                <td style="padding: 0.75rem; font-family: var(--font-mono);">$${cost.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        const massEl = document.getElementById('bom-total-mass');
        const powerEl = document.getElementById('bom-total-power');
        const costEl = document.getElementById('bom-total-cost');
        
        if (massEl) massEl.textContent = `${(totalMass / 1000).toFixed(2)} kg`;
        if (powerEl) powerEl.textContent = `${totalPower.toFixed(0)} mW`;
        if (costEl) costEl.textContent = `$${totalCost.toFixed(2)}`;
    }
}
