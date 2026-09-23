// requirements.js - P3 Phase Update
// Populates RTM table with Threshold + Verification Method columns.
// Evidence now returns {reference_id, source_type, status} objects.

let requirementsData = [];

function getStatusBadge(status) {
    const s = (status || "PENDING").toUpperCase();
    const MAP = {
        "SIMULATED":            { bg: "rgba(16,185,129,0.2)",  color: "var(--accent-emerald)" },
        "IMPLEMENTED":          { bg: "rgba(16,185,129,0.2)",  color: "var(--accent-emerald)" },
        "PASSED":               { bg: "rgba(16,185,129,0.2)",  color: "var(--accent-emerald)" },
        "PASS":                 { bg: "rgba(16,185,129,0.2)",  color: "var(--accent-emerald)" },
        "DESIGN ESTIMATE":      { bg: "rgba(59,130,246,0.2)",  color: "rgb(96,165,250)" },
        "BENCH DEMONSTRATED":   { bg: "rgba(245,158,11,0.2)",  color: "var(--accent-amber)" },
        "DESIGN TARGET":        { bg: "rgba(59,130,246,0.2)",  color: "rgb(59,130,246)" },
        "NOT VALIDATED":        { bg: "rgba(100,116,139,0.2)", color: "var(--text-dim)" },
        "NOT_VALIDATED":        { bg: "rgba(100,116,139,0.2)", color: "var(--text-dim)" },
        "VALIDATION PENDING":{ bg: "rgba(245,158,11,0.1)",  color: "var(--accent-amber)" },
        "PENDING":              { bg: "rgba(245,158,11,0.1)",  color: "var(--accent-amber)" },
        "FAILED":               { bg: "rgba(239,68,68,0.2)",   color: "var(--tactical-red)" },
    };
    const style = MAP[s] || MAP["PENDING"];
    return `<span style="background:${style.bg};color:${style.color};padding:0.2rem 0.4rem;border-radius:4px;font-weight:bold;font-size:0.7rem;white-space:nowrap;">${status}</span>`;
}

function getVerifMethodBadge(method) {
    if (!method) return '<span style="color:var(--text-dim);font-size:0.75rem;">-</span>';
    const COLORS = {
        "SIMULATION":    "var(--accent-cyan)",
        "ANALYSIS":      "rgb(96,165,250)",
        "INSPECTION":    "var(--accent-amber)",
        "DEMONSTRATION": "var(--accent-emerald)",
    };
    const color = COLORS[method] || "var(--text-dim)";
    return `<span style="color:${color};font-family:var(--font-mono);font-size:0.7rem;">${method}</span>`;
}

export async function renderRequirements() {
    const tbody = document.getElementById("requirements-table-body");
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--text-dim);padding:1.5rem;font-style:italic;'>Loading requirements from database...</td></tr>";

    let data;
    try {
        const res = await fetch("/api/requirements");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        data = json.data || json;
    } catch (err) {
        console.error("[Requirements] Fetch error:", err);
        tbody.innerHTML = `<tr><td colspan='6' style='text-align:center;color:var(--tactical-red);padding:1.5rem;'>Error loading requirements: ${err.message}</td></tr>`;
        return;
    }

    requirementsData = data;
    tbody.innerHTML = "";

    data.forEach(req => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        tr.style.transition = "background 0.15s";
        tr.addEventListener("mouseenter", () => tr.style.background = "rgba(255,255,255,0.03)");
        tr.addEventListener("mouseleave", () => tr.style.background = "");

        let evidenceHtml = "<span style='color:var(--text-dim);font-size:0.75rem;'>-</span>";
        if (req.evidence && req.evidence.length > 0) {
            evidenceHtml = req.evidence.map(e => {
                const refId = e.reference_id || e;
                const src = e.source_type ? `<span style='color:var(--text-dim);font-size:0.65rem;margin-left:4px;'>[${e.source_type}]</span>` : "";
                const statusHtml = e.status ? `<span style='margin-left:4px;'>${getStatusBadge(e.status)}</span>` : "";
                return `<div style='margin-bottom:2px;'><span style='color:var(--accent-cyan);font-family:var(--font-mono);font-size:0.73rem;'>${refId}</span>${src}${statusHtml}</div>`;
            }).join("");
        }

        const threshold = req.threshold
            ? `<span style='font-family:var(--font-mono);font-size:0.75rem;color:var(--text-secondary);'>${req.threshold}</span>`
            : "<span style='color:var(--text-dim);font-size:0.75rem;'>-</span>";

        const descTitle = req.description ? `title="${req.description}"` : "";

        tr.innerHTML = `
            <td style="padding:0.6rem 0.75rem;color:var(--text-primary);font-family:var(--font-mono);white-space:nowrap;font-size:0.8rem;">${req.id}</td>
            <td style="padding:0.6rem 0.75rem;color:var(--text-secondary);font-size:0.82rem;" ${descTitle}>${req.name}</td>
            <td style="padding:0.6rem 0.75rem;">${threshold}</td>
            <td style="padding:0.6rem 0.75rem;">${getVerifMethodBadge(req.verification_method)}</td>
            <td style="padding:0.6rem 0.75rem;">${getStatusBadge(req.status)}</td>
            <td style="padding:0.6rem 0.75rem;">${evidenceHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    const counter = document.getElementById("req-count-badge");
    if (counter) counter.textContent = `${data.length} requirements`;
}
