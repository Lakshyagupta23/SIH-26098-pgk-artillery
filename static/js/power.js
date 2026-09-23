export async function renderPowerBudget() {
    // Flight time in seconds (standard envelope)
    const flightTimeSeconds = 60.0;

    let powerData = [];
    try {
        const response = await fetch('/api/power');
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.subsystems) {
                powerData = data.subsystems.map(s => ({
                    subsystem: s.name,
                    nominal: s.nominal_power_mw,
                    peak: s.peak_power_mw,
                    dutyCycle: s.duty_cycle_pct / 100.0,
                    efficiency: s.conversion_efficiency,
                    source: s.source || "DESIGN ESTIMATE"
                }));
            }
        }
    } catch (e) {
        console.error("Failed to fetch power data", e);
    }

    let totalEnergyGross = 0;

    const tbody = document.getElementById('power-budget-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    powerData.forEach(item => {
        // Nominal energy consumed by component (Joules = Watts * Seconds)
        // Convert mW to W by dividing by 1000
        const consumedJoules = (item.nominal / 1000) * flightTimeSeconds * item.dutyCycle;
        
        // Gross energy pulled from battery (accounting for DC/DC efficiency)
        const grossJoules = consumedJoules / item.efficiency;
        totalEnergyGross += grossJoules;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        tr.innerHTML = `
            <td style="padding: 0.75rem; color: #fff;">${item.subsystem}</td>
            <td style="padding: 0.75rem; color: var(--text-secondary);">${item.nominal}</td>
            <td style="padding: 0.75rem; color: var(--text-secondary);">${item.peak}</td>
            <td style="padding: 0.75rem; color: var(--accent-cyan);">${(item.dutyCycle * 100).toFixed(0)}%</td>
            <td style="padding: 0.75rem; color: var(--text-primary);">${consumedJoules.toFixed(2)}</td>
            <td style="padding: 0.75rem; color: var(--text-dim);">${(item.efficiency * 100).toFixed(0)}%</td>
            <td style="padding: 0.75rem; color: var(--accent-emerald); font-weight: bold;">${grossJoules.toFixed(2)}</td>
            <td style="padding: 0.75rem;"><span class="status-badge status-simulated">${item.source}</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Apply 20% aerospace margin
    const requiredBattery = totalEnergyGross * 1.20;

    document.getElementById('pb-total-energy').textContent = totalEnergyGross.toFixed(2) + ' J';
    document.getElementById('pb-total-battery').textContent = requiredBattery.toFixed(2) + ' J';
}
