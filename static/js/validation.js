// validation.js - Phase P3 live compliance gauge
export async function loadValidationSummary() {
    try {
        const res = await fetch("/api/validation/summary");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const summary = data.data;

        // Update counts
        const countSim = document.getElementById("count-simulated");
        if (countSim) countSim.textContent = summary.status_counts["SIMULATED"] || 0;
        
        const countDes = document.getElementById("count-design");
        if (countDes) countDes.textContent = summary.status_counts["DESIGN ESTIMATE"] || 0;
        
        const countPen = document.getElementById("count-pending");
        if (countPen) countPen.textContent = summary.status_counts["PENDING"] || 0;
        
        const countTot = document.getElementById("count-total");
        if (countTot) countTot.textContent = summary.total_requirements || 0;
        
        const countEvi = document.getElementById("count-evidence");
        if (countEvi) countEvi.textContent = `${summary.evidence_coverage_pct}%`;
        
        const countUnm = document.getElementById("count-unmet-critical");
        if (countUnm) countUnm.textContent = summary.unmet_critical.length;

        // Update Gauge Arc
        const gaugeArc = document.getElementById("gauge-arc");
        const gaugeText = document.getElementById("gauge-pct-text");
        if (gaugeArc && gaugeText) {
            gaugeText.textContent = `${summary.verification_coverage_pct}%`;
            // length of arc is ~251. Stroke-dasharray: <filled> <remaining>
            const fill = (summary.verification_coverage_pct / 100) * 251;
            gaugeArc.style.strokeDasharray = `${fill} 251`;
        }

        // Update Unmet Critical Panel
        const unmetPanel = document.getElementById("unmet-critical-panel");
        const unmetList = document.getElementById("unmet-critical-list");
        if (unmetPanel && unmetList) {
            if (summary.unmet_critical.length > 0) {
                unmetPanel.style.display = "block";
                unmetList.innerHTML = summary.unmet_critical.map(req => 
                    `<div style="margin-bottom:0.25rem;"><strong>${req.req_id} (${req.name}):</strong> Status is ${req.status} (Threshold: ${req.threshold})</div>`
                ).join("");
            } else {
                unmetPanel.style.display = "none";
                unmetList.innerHTML = "";
            }
        }
    } catch (err) {
        console.error("Failed to load validation summary:", err);
    }
}

// Bind to window for onclick
window.loadValidationSummary = loadValidationSummary;
