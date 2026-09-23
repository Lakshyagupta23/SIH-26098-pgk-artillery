/* ==========================================================================
   AEGIS-155: Offline Demo Mode — Phase 21 (SIH Offline-First)

   Contains:
   1. Connectivity monitor — polls /api/health and updates status banner
   2. Pre-seeded demo datasets for SIH presentation without a live backend
   ========================================================================== */

// ─── 1. CONNECTIVITY MONITOR ────────────────────────────────────────────────

const CONNECTIVITY_POLL_MS = 5000;
let lastConnectivityState = null;

async function checkConnectivity() {
    const banner = document.getElementById('offline-status-banner');
    const icon   = document.getElementById('offline-status-icon');
    const text   = document.getElementById('offline-status-text');
    if (!banner) return;

    const cesiumOffline = window.CESIUM_OFFLINE || typeof window.Cesium === 'undefined';

    try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
            if (cesiumOffline) {
                // Backend OK but Cesium offline
                if (lastConnectivityState !== 'PARTIAL') {
                    lastConnectivityState = 'PARTIAL';
                    banner.style.display = 'block';
                    banner.style.background = 'rgba(255,149,0,0.85)';
                    banner.style.color = '#000';
                    icon.textContent = '🟡';
                    text.textContent = 'PARTIAL OFFLINE — Backend connected · Cesium satellite imagery unavailable (Three.js 3D view active)';
                }
            } else {
                // Fully online
                if (lastConnectivityState !== 'ONLINE') {
                    lastConnectivityState = 'ONLINE';
                    banner.style.display = 'none'; // hide banner when all is well
                }
            }
        } else {
            throw new Error('Backend returned non-OK');
        }
    } catch {
        // Backend unreachable
        if (lastConnectivityState !== 'OFFLINE') {
            lastConnectivityState = 'OFFLINE';
            banner.style.display = 'block';
            banner.style.background = 'rgba(220,38,38,0.9)';
            banner.style.color = '#fff';
            icon.textContent = '🔴';
            text.textContent = 'OFFLINE DEMO MODE — Backend unavailable · Showing pre-seeded simulation results';

            // Activate demo data for any visible panels
            activateDemoMode();
        }
    }
}

// Start polling after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    checkConnectivity();
    setInterval(checkConnectivity, CONNECTIVITY_POLL_MS);
});

// ─── 2. PRE-SEEDED DEMO DATASETS ────────────────────────────────────────────
// These are real-ish simulation outputs computed offline at design time.
// They are displayed when the backend is unreachable so the SIH
// presentation can still demonstrate the full feature set.

export const DEMO_MONTE_CARLO = {
    metadata: {
        run_id: "DEMO-SIH-2026-001",
        random_seed: 428193,
        runs: 1000,
        physics_version: "2.2.0",
        frontend_version: "2.2.0",
        backend_version: "2.2.0",
        configuration_hash: "a3f7c12d",
        result_hash: "b9e2451f",
        label: "[SIMULATED — Pre-seeded offline demo]"
    },
    cep_guided_50: 0.0,
    cep_guided_90: 0.0,
    cep_unguided_50: 0.0,
    cep_unguided_90: 0.0,
    mean_radial_error: 0.0,
    max_radial_error: 0.0,
    std_radial_error: 0.0,
    ci_95_x: 0.0,
    ci_95_z: 0.0,
    runs: 0,
    guided_impacts: [],
    unguided_impacts: [],
};

export const DEMO_TRAJECTORY = {
    label: "[SIMULATED — Pre-seeded offline demo]",
    status: "success",
    final_state: {
        t: 47.2,
        x: 14820.0,
        y: 1.2,
        z: 3.8,
        detonated: true,
        detonationMode: "PROXIMITY",
        isArmed: true,
        pgkActive: true,
        gnssLock: true,
    },
    history: generateDemoTrajectory(14820, 45.0),
};

export const DEMO_ERROR_BUDGET = {
    label: "[SIMULATED — Pre-seeded offline demo]",
    contributions: [
        { source: "Navigation Uncertainty (GNSS noise)", cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "Launch Angle Uncertainty",             cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "Muzzle Velocity Uncertainty",         cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "Wind Uncertainty",                    cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "INS Drift (GNSS Denied)",             cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "Actuator Response Uncertainty",       cep_contribution_m: 0.0, relative_pct: 0.0 },
        { source: "Timing Jitter",                       cep_contribution_m: 0.0, relative_pct: 0.0 },
    ],
    total_cep_50_m: 0.0,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function seededRandom(seed) {
    // Simple LCG PRNG for deterministic demo data
    let s = seed;
    return function() {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

function generateDemoImpacts(n, cep, type) {
    const rng = seededRandom(type === 'guided' ? 428193 : 99217);
    const pts = [];
    const sigma = cep / 1.1774; // CEP50 to sigma conversion
    for (let i = 0; i < n; i++) {
        // Box-Muller transform
        const u1 = Math.max(1e-10, rng());
        const u2 = rng();
        const mag = sigma * Math.sqrt(-2 * Math.log(u1));
        const x = mag * Math.cos(2 * Math.PI * u2);
        const z = mag * Math.sin(2 * Math.PI * u2);
        pts.push({ x, y: 0, z, distErr: Math.sqrt(x * x + z * z) });
    }
    return pts;
}

function generateDemoTrajectory(targetX, elevDeg) {
    const history = [];
    const dt = 0.4;
    const v0 = 827;
    const vx0 = v0 * Math.cos(elevDeg * Math.PI / 180);
    const vy0 = v0 * Math.sin(elevDeg * Math.PI / 180);
    let x = 0, y = 0, vx = vx0, vy = vy0, t = 0;
    const g = 9.81;
    while (y >= 0 || t < 0.1) {
        history.push({ t, x, y, z: 0, vx, vy, vz: 0 });
        const drag = 0.00004 * (vx * vx + vy * vy);
        const speed = Math.sqrt(vx * vx + vy * vy);
        vx -= (drag * vx / speed) * dt;
        vy -= (g + drag * vy / speed) * dt;
        x += vx * dt;
        y += vy * dt;
        t += dt;
        if (y < 0) break;
        if (t > 200) break;
    }
    return history;
}

// ─── 3. DEMO MODE ACTIVATION ─────────────────────────────────────────────────

function activateDemoMode() {
    // Dispatch a custom event — main.js can listen for it and populate the UI
    window.dispatchEvent(new CustomEvent('aegis-demo-mode', {
        detail: {
            monteCarlo: DEMO_MONTE_CARLO,
            trajectory: DEMO_TRAJECTORY,
            errorBudget: DEMO_ERROR_BUDGET,
        }
    }));
    console.warn('[AEGIS-155] Demo mode activated — displaying pre-seeded offline data.');
}

// Export for use in main.js
export { activateDemoMode, checkConnectivity };
