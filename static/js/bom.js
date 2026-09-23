export async function renderBOM() {
    let bomData = [];
    try {
        const response = await fetch('/api/bom');
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.bom && data.bom.components) {
                // Map DB schema back to frontend expected structure
                bomData = data.bom.components.map(c => ({
                    component: c.component_id,
                    category: c.category,
                    part: c.representative_part,
                    supplier: "Various", // Supplier not in DB currently
                    qty: c.quantity,
                    unitCost: c.unit_cost,
                    mass: c.mass_g,
                    powerAvg: c.power_mw,
                    powerPeak: c.power_mw,
                    source: c.status,
                    confidence: "Med", // Defaulting as DB didn't have confidence everywhere
                    alternative: "-"
                }));
            }
        }
    } catch (e) {
        console.error("Failed to fetch BOM data", e);
    }

    let totalMass = 0;
    let totalCost = 0;
    let totalPowerAvg = 0;
    let totalPowerPeak = 0;

    const costBySub = {};
    const massBySub = {};

    const tbody = document.getElementById('bom-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    bomData.forEach(item => {
        const itemCost = item.qty * item.unitCost;
        const itemMass = item.qty * item.mass;
        const itemPowerAvg = item.qty * item.powerAvg;
        const itemPowerPeak = item.qty * item.powerPeak;

        totalMass += itemMass;
        totalCost += itemCost;
        totalPowerAvg += itemPowerAvg;
        totalPowerPeak += itemPowerPeak;

        if (!costBySub[item.category]) costBySub[item.category] = 0;
        if (!massBySub[item.category]) massBySub[item.category] = 0;
        
        costBySub[item.category] += itemCost;
        massBySub[item.category] += itemMass;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        tr.innerHTML = `
            <td style="padding: 0.75rem; color: #fff; white-space: nowrap;">${item.component}</td>
            <td style="padding: 0.75rem; color: var(--text-secondary); white-space: nowrap;">${item.category}</td>
            <td style="padding: 0.75rem; color: var(--accent-cyan); white-space: nowrap; font-family: var(--font-mono); font-size: 0.75rem;">${item.part}</td>
            <td style="padding: 0.75rem; color: var(--text-dim); white-space: nowrap;">${item.supplier}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">${item.qty}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">$${item.unitCost.toFixed(2)}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">${itemMass.toFixed(1)}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">${itemPowerAvg} / ${itemPowerPeak}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">${item.source}</td>
            <td style="padding: 0.75rem; white-space: nowrap;">
                <span style="background: ${item.confidence === 'High' ? 'rgba(16,185,129,0.2)' : (item.confidence === 'Med' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)')};
                             color: ${item.confidence === 'High' ? 'var(--accent-emerald)' : (item.confidence === 'Med' ? 'var(--accent-orange)' : 'var(--accent-crimson)')};
                             padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">
                    ${item.confidence}
                </span>
            </td>
            <td style="padding: 0.75rem; color: var(--text-dim); white-space: nowrap; font-size: 0.75rem;">${item.alternative}</td>
        `;
        tbody.appendChild(tr);
    });

    // Format Aggregates
    document.getElementById('bom-total-mass').textContent = (totalMass / 1000).toFixed(2) + ' kg';
    document.getElementById('bom-total-cost').textContent = '$' + totalCost.toFixed(2);
    document.getElementById('bom-total-power').textContent = `${totalPowerAvg} mW / ${totalPowerPeak} mW`;

    // Render Subsystem Breakdown
    const costBreakdownEl = document.getElementById('bom-cost-breakdown');
    if (costBreakdownEl) {
        costBreakdownEl.innerHTML = Object.entries(costBySub)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>${cat}</span><span style="color: var(--accent-cyan);">$${val.toFixed(2)}</span></div>`)
            .join('');
    }

    const massBreakdownEl = document.getElementById('bom-mass-breakdown');
    if (massBreakdownEl) {
        massBreakdownEl.innerHTML = Object.entries(massBySub)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>${cat}</span><span style="color: var(--text-primary);">${val.toFixed(1)} g</span></div>`)
            .join('');
    }
}
