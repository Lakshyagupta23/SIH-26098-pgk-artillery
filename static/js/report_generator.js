/**
 * AEGIS-155: SIH Phase P3 Report Generator
 * Async, backend-driven: fetches all data from APIs before generating the report.
 */

async function _fetchJSON(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

export async function generateAndPrintReport() {
    const reportContainer = document.getElementById("report-container");
    if (!reportContainer) {
        console.error("Report container not found in DOM.");
        return;
    }

    reportContainer.innerHTML = `<div style="text-align:center;padding:3rem;color:#8899aa;font-family:monospace;">
        Fetching live data from database...
    </div>`;

    const [latestJob, bomData, powerData, reqData, testData, versionData] = await Promise.all([
        _fetchJSON("/api/jobs/latest"),
        _fetchJSON("/api/bom"),
        _fetchJSON("/api/power"),
        _fetchJSON("/api/requirements"),
        _fetchJSON("/api/test-runs"),
        _fetchJSON("/api/version"),
    ]);

    const hasJob = latestJob && latestJob.status === "success";
    const mcCep50 = hasJob ? `${latestJob.cep_guided_50?.toFixed(1)} m (Simulated)` : "Not simulated";
    const mcCep90 = hasJob ? `${latestJob.cep_guided_90?.toFixed(1)} m` : "—";
    const unguidedCep50 = hasJob ? `${latestJob.cep_unguided_50?.toFixed(1)} m` : "—";
    const unguidedCep90 = hasJob ? `${latestJob.cep_unguided_90?.toFixed(1)} m` : "—";
    const mcRuns = hasJob ? latestJob.runs : "—";
    const mcSeed = hasJob ? latestJob.random_seed : "—";
    const mcHash = hasJob ? (latestJob.result_hash || "").slice(0, 16) : "—";
    const mcJobId = hasJob ? latestJob.job_id : "—";
    const physicsVer = hasJob ? latestJob.physics_version : "—";
    const mcTimestamp = hasJob && latestJob.completed_at
        ? new Date(latestJob.completed_at).toLocaleString("en-IN") : "—";

    const bomItems = (bomData?.data || []);
    const totalCost = bomItems.reduce((s, b) => s + (b.unit_cost * b.quantity), 0);
    const totalMass = bomItems.reduce((s, b) => s + (b.mass_g * b.quantity), 0);
    const bomRows = bomItems.map(b => `<tr>
        <td>${b.component_id}</td><td>${b.category}</td><td>${b.representative_part}</td>
        <td>${b.supplier || "—"}</td><td style="text-align:center">${b.quantity}</td>
        <td style="text-align:right">Rs.${b.unit_cost?.toFixed(0)}</td>
        <td style="text-align:right">${b.mass_g}g</td>
        <td style="text-align:center">${b.confidence}</td>
    </tr>`).join("");

    const powerItems = (powerData?.data || []);
    const totalNominal = powerItems.reduce((s, p) => s + (p.nominal_power_mw * (p.duty_cycle_pct / 100)), 0);
    const totalPeak = powerItems.reduce((s, p) => s + p.peak_power_mw, 0);
    const powerRows = powerItems.map(p => `<tr>
        <td>${p.name}</td>
        <td style="text-align:right">${p.nominal_power_mw?.toFixed(0)} mW</td>
        <td style="text-align:right">${p.peak_power_mw?.toFixed(0)} mW</td>
        <td style="text-align:right">${p.duty_cycle_pct}%</td>
        <td style="text-align:right">${(p.nominal_power_mw * p.duty_cycle_pct / 100)?.toFixed(0)} mW</td>
    </tr>`).join("");

    const reqItems = (reqData?.data || []);
    const statusIcon = {"SIMULATED":"checkmark","DESIGN ESTIMATE":"circle","PENDING":"pending"};
    const rtmRows = reqItems.map(r => `<tr>
        <td style="white-space:nowrap">${r.id}</td><td>${r.name}</td>
        <td>${r.threshold || "—"}</td>
        <td style="text-align:center">${r.verification_method || "—"}</td>
        <td style="text-align:center"><strong>${r.status}</strong></td>
        <td>${r.evidence?.map(e => e.reference_id).join(", ") || "—"}</td>
    </tr>`).join("");

    const testItems = (testData?.data || []);
    const testRows = testItems.map(t => `<tr>
        <td style="white-space:nowrap">${t.id}</td><td>${t.date}</td>
        <td>${t.objective}</td>
        <td style="text-align:center">${t.status}</td>
        <td>${t.observed || "—"}</td>
    </tr>`).join("");

    const sysVer = versionData?.data || {};
    const today = new Date().toLocaleDateString("en-IN", {year:"numeric",month:"long",day:"numeric"});

    const provenance = `<div style="border-top:1px solid #ccc;margin-top:20px;padding-top:10px;font-size:0.7rem;color:#888;font-family:monospace;">
        <strong>DATA PROVENANCE</strong> | Generated: ${new Date().toISOString()} | Physics: ${physicsVer} | Backend: ${sysVer.backend_version || "N/A"} | MC Seed: ${mcSeed} | Hash: ${mcHash} | Job: ${mcJobId}<br>
        All simulation results are Software-in-the-Loop (SIL). Physical validation pending.
    </div>`;

    const html = `
    <div class="report-cover page-break">
        <h1>AEGIS-155 PGK</h1>
        <h3>Precision Guidance Kit and Multi-Mode Electronic Fuze for 155mm Artillery</h3>
        <p style="margin-top:50px"><strong>Smart India Hackathon 2026</strong></p>
        <p>Problem Statement ID: #26098</p><p>Date: ${today}</p>
        <p style="font-size:0.8rem;color:#888">Physics: ${physicsVer} | Backend: ${sysVer.backend_version || "N/A"}</p>
    </div>

    <div class="page-break">
        <h2>1. Problem Statement</h2>
        <p>Modern artillery requires precision to minimize collateral damage. Standard unguided 155mm shells suffer CEP over 100m at 15km due to launch angle uncertainties, muzzle velocity variations, and meteorological effects.</p>

        <h2>2. Proposed Architecture</h2>
        <p>The AEGIS-155 is a drop-in PGK and Multi-Mode Electronic Fuze. It threads into the standard NATO 2-inch fuze well. A Canard Actuation Assembly (CAA) deploys post-launch providing aerodynamic steering to correct trajectory in real-time.</p>

        <h2>3. System Subsystems</h2>
        <ul>
            <li><strong>GNSS Antenna:</strong> Multi-constellation patch antenna (GPS + NavIC).</li>
            <li><strong>GEU:</strong> STM32H7/TMS570 MCU, tactical MEMS IMU, EKF logic.</li>
            <li><strong>CAA:</strong> 4 independent canard fins, +/-15deg deflection, 60deg/s slew rate.</li>
            <li><strong>FMCW Radar:</strong> 24 GHz-class FMCW (BGT24M representative part) for Height-of-Burst proximity sensing. 77 GHz-class noted as upgrade option for enhanced resolution.</li>
            <li><strong>ESAD:</strong> Setback + spin dual-interlock safe-and-arm device.</li>
            <li><strong>Multi-Mode Fuze:</strong> Proximity, PD, Time, Delay.</li>
            <li><strong>Power:</strong> Setback-activated reserve thermal battery, ~90s flight.</li>
        </ul>

        <h2>4. Navigation</h2>
        <p>Tightly-coupled GNSS/INS hybrid with Extended Kalman Filter (EKF). 10 Hz GNSS + 1 kHz IMU. Graceful degradation to INS-only under GNSS denial.</p>

        <h2>5. Control</h2>
        <p>Proportional Navigation (PN) guidance law. Canards deflect to generate lateral acceleration via differential lift, correcting trajectory errors in 2D.</p>
    </div>

    <div class="page-break">
        <h2>6. Simulation Assumptions</h2>
        <ul>
            <li>Projectile: 155mm M795 equivalent (43.5 kg, per SIMULATION_CONFIG). Atmosphere: US 1976 Standard. Drag: Mach-dependent Cd.</li>
            <li>Coriolis: 3D cross-product acceleration. Wind Shear: 3-layer model (Low/Medium/High altitude).</li>
            <li>Launch: 45deg elevation, ~800 m/s muzzle velocity. Range: 15,000m evaluation standard.</li>
        </ul>

        <h2>7. Simulation Results</h2>
        <p>The 3DOF reduced-order simulation indicates that, under the modeled assumptions and uncertainty scenarios, aerodynamic steering can reduce the simulated trajectory dispersion. Correction phase begins at apogee. These findings are bounded by the simulation model and do not constitute physical validation.</p>

        <h2>8. Monte Carlo Analysis</h2>
        <p>${mcRuns}-round Monte Carlo (Gaussian noise: launch velocity sigma=2m/s, angle sigma=0.1deg, GNSS sigma=4m, wind sigma=1.5m/s):</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%">
            <thead><tr style="background:#f5f5f5"><th>Metric</th><th>Unguided (Baseline)</th><th>Guided (AEGIS-155)</th></tr></thead>
            <tbody>
                <tr><td>CEP 50</td><td>${unguidedCep50}</td><td>${mcCep50}</td></tr>
                <tr><td>CEP 90</td><td>${unguidedCep90}</td><td>${mcCep90}</td></tr>
                <tr><td>Simulation Runs</td><td>${mcRuns}</td><td>${mcRuns}</td></tr>
                <tr><td>Completed</td><td colspan="2">${mcTimestamp}</td></tr>
            </tbody>
        </table>
        ${provenance}

        <h2>9. Error Budget</h2>
        <p>Dominant contributors: Navigation (GNSS noise + INS drift), Launch angle error, Wind estimation. GNSS quality is the primary CEP driver at nominal conditions.</p>

        <h2>10. Validation Status</h2>
        <p>Current status: Software-in-the-Loop (SIL) <strong>[SIMULATED]</strong>. Flight dynamics modeled in software. Physical tests (high-G setback at 18,450g; spin at 260Hz) remain future milestones.</p>
    </div>

    <div class="page-break">
        <h2>11. Requirements Traceability Matrix (${reqItems.length} requirements)</h2>
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:0.75rem">
            <thead><tr style="background:#f5f5f5"><th>ID</th><th>Name</th><th>Threshold</th><th>Method</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>${rtmRows}</tbody>
        </table>
    </div>

    <div class="page-break">
        <h2>12. Hardware Demonstrator</h2>
        <p>Benchtop inert demonstrator architecture: STM32 + MPU-6050 IMU intended to exercise the telemetry pipeline, state-machine logic, and timing instrumentation. Physical integrated validation remains pending. No energetic components.</p>

        <h2>13. Power Budget</h2>
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%">
            <thead><tr style="background:#f5f5f5"><th>Subsystem</th><th>Nominal</th><th>Peak</th><th>Duty Cycle</th><th>Effective Avg</th></tr></thead>
            <tbody>${powerRows}
                <tr style="font-weight:bold;background:#f5f5f5">
                    <td>TOTAL</td>
                    <td>${totalNominal?.toFixed(0)} mW</td>
                    <td>${(totalPeak/1000)?.toFixed(2)} W</td>
                    <td>—</td>
                    <td>${(totalNominal/1000)?.toFixed(2)} W</td>
                </tr>
            </tbody>
        </table>

        <h2>14. SWaP-C Summary</h2>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:60%">
            <tr><th>Parameter</th><th>Value</th><th>Basis</th></tr>
            <tr><td>Size</td><td>NATO 2-inch fuze well (57mm OD)</td><td>DESIGN ESTIMATE</td></tr>
            <tr><td>Weight (BOM sum)</td><td>${(totalMass/1000)?.toFixed(2)} kg</td><td>DESIGN ESTIMATE</td></tr>
            <tr><td>Power Nominal</td><td>${(totalNominal/1000)?.toFixed(2)} W</td><td>DESIGN ESTIMATE</td></tr>
            <tr><td>Power Peak</td><td>${(totalPeak/1000)?.toFixed(2)} W</td><td>DESIGN ESTIMATE</td></tr>
            <tr><td>BOM Cost (Prototype)</td><td>Rs.${totalCost?.toFixed(0)}</td><td>DESIGN ESTIMATE</td></tr>
        </table>
    </div>

    <div class="page-break">
        <h2>15. Bill of Materials (${bomItems.length} items)</h2>
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:0.75rem">
            <thead><tr style="background:#f5f5f5"><th>ID</th><th>Category</th><th>Part</th><th>Supplier</th><th>Qty</th><th>Cost</th><th>Mass</th><th>Confidence</th></tr></thead>
            <tbody>${bomRows}
                <tr style="font-weight:bold;background:#f5f5f5"><td colspan="5">TOTAL</td><td>Rs.${totalCost?.toFixed(0)}</td><td>${totalMass?.toFixed(0)}g</td><td>—</td></tr>
            </tbody>
        </table>

        <h2>16. Test Log (${testItems.length} records)</h2>
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:0.75rem">
            <thead><tr style="background:#f5f5f5"><th>ID</th><th>Date</th><th>Objective</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>${testRows}</tbody>
        </table>
    </div>

    <div class="page-break">
        <h2>17. Limitations</h2>
        <ul>
            <li>3DOF reduced-order model (not full 6DOF). Magnus effect and balloting not modelled.</li>
            <li>Canard despin bearing mechanism is conceptual, no wind-tunnel validation.</li>
            <li>High-G hardening of COTS components assumed but not physically tested.</li>
            <li>All cost/mass values are DESIGN ESTIMATES, not measured on fabricated hardware.</li>
        </ul>

        <h2>18. Future Work</h2>
        <ul>
            <li>Full 6DOF non-linear simulation with rigid-body dynamics and Magnus effect.</li>
            <li>Dynamic 3D ellipsoid flight path visualization implemented with CesiumJS.</li>
            <li>Wind-tunnel testing of Canard Actuation Assembly aerodynamics.</li>
            <li>High-G shock testing: 18,450g setback at 1ms duration.</li>
            <li>Spin validation at 260 Hz using spin rig.</li>
            <li>Thermal validation per MIL-STD-810 Method 501/502.</li>
            <li>Live-fire demonstration at a proving ground.</li>
        </ul>

        <h2>19. Conclusion</h2>
        <p>The AEGIS-155 project serves as a digital engineering demonstrator and reduced-order simulation platform exploring the algorithmic feasibility of retrofitting unguided 155mm artillery shells. Through ${mcRuns}-round Monte Carlo analysis (seed ${mcSeed}), the simulated system estimates a CEP50 of ${mcCep50} vs. unguided ${unguidedCep50}. This remains an inert/software demonstration and is not physically validated.</p>
        <p>All results are clearly labelled (SIMULATED / DESIGN ESTIMATE / PENDING) to maintain engineering honesty before physical validation is performed.</p>
        <p style="text-align:center;margin-top:40px;color:#666;">-- END OF REPORT --</p>
        ${provenance}
    </div>`;

    reportContainer.innerHTML = html;
    setTimeout(() => { window.print(); }, 200);
}
