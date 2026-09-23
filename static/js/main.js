/**
 * Aegis-155 Application Controller & UI Logic (Tactical Premium Edition)
 * SIH Problem Statement ID: 26098
 */

import BallisticsEngine from './physics.js';
import TacticalSoundEngine from './sound.js';
import AegisCesiumGlobe from './cesium_globe.js?v=BUILD6c';
import { TelemetryModule } from './telemetry.js';
import { EngineeringModule } from './engineering.js';
import { FaultLabModule } from './faults.js';
import { renderRequirements } from './requirements.js';
import { renderTestCenter } from './test_center.js';
import { renderBOM } from './bom.js';
import { renderPowerBudget } from './power.js';
import { renderSystemVersion } from './version.js';
import { renderAuditLogs } from './audit.js';
import { checkConnectivity, DEMO_MONTE_CARLO, DEMO_TRAJECTORY } from './offline_demo.js';

import { generateAndPrintReport } from './report_generator.js';
import { renderCredibilityCards } from './credibility.js';
import { loadValidationSummary } from './validation.js';

document.addEventListener('DOMContentLoaded', async () => {
    const btnGenerateReport = document.getElementById('btn-generate-report');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', generateAndPrintReport);
    }

    // Render static Model Credibility data
    renderCredibilityCards();
    loadValidationSummary();


    // 0. Fetch Centralized Hardware Config
    window.HARDWARE_CONFIG = null;
    try {
        const res = await fetch('/api/config/hardware');
        if (res.ok) {
            window.HARDWARE_CONFIG = await res.json();
            console.log("Loaded Hardware Config:", window.HARDWARE_CONFIG);
            
            // Update BOM UI text dynamically
            const elements = document.querySelectorAll('.bom-card p');
            elements.forEach(el => {
                if (el.innerHTML.includes('Max Deflection Rate')) {
                    el.innerHTML = `Max Deflection Rate: ${window.HARDWARE_CONFIG.actuator_max_slew_rate_deg_s}° / sec<br>Actuator Torque: 1.8 Nm per fin<br>Spin Decoupling: Precision Dual Ball Bearing Collar (15,000 RPM shell body vs 0 RPM nose)`;
                }
                if (el.innerHTML.includes('cruciform canards up to')) {
                    el.innerHTML = `Spin-decoupled nose assembly housing 4 independent brushless DC micro-servos. Operates cruciform canards up to +/- ${window.HARDWARE_CONFIG.actuator_max_deflection_deg}° pitch/yaw deflection to steer trajectory mid-flight.`;
                }
            });
        }
    } catch (e) {
        console.error("Failed to load hardware config", e);
    }

    // 1. Initialize Physics Engine
    const engine = new BallisticsEngine();
    engine.programmedFlightTime = 60.0;
    
    // Initialize Lean Digital Twin Modules
    const telemetry = new TelemetryModule();
    const engineering = new EngineeringModule();
    const faultLab = new FaultLabModule();
    
    // Render Requirements Table
    renderRequirements();
    
    // Render Test Center Table
    renderTestCenter();
    
    // Render Preliminary Concept BOM
    renderBOM();
    
    // Render Power Budget
    renderPowerBudget();
    
    // Render System Versions
    renderSystemVersion();

    // Render Audit Logs
    renderAuditLogs();

    // ── P7: Load Latest Completed MC Job on Startup ────────────────────
    (async () => {
        try {
            const latestRes = await fetch('/api/jobs/latest');
            if (!latestRes.ok) return;
            const latestData = await latestRes.json();
            if (latestData.status === 'success' && latestData.raw) {
                engine.monteCarloResults = latestData.raw;
                engine.monteCarloResults.job_id = latestData.job_id;
                engine.monteCarloResults.resultHash = latestData.result_hash || latestData.raw.resultHash;
                // Restore seed so Replay works
                if (latestData.random_seed !== undefined) {
                    engine.monteCarloSeed = latestData.random_seed;
                }
                // Defer rendering until canvas is ready
                setTimeout(() => {
                    if (typeof renderMonteCarloCanvas === 'function') renderMonteCarloCanvas();

                    if (typeof renderPlotly3D === 'function') renderPlotly3D(engine.monteCarloResults);
                    const jobIdShort = (latestData.job_id || '').substring(0, 8).toUpperCase();
                    logTerminal(`[P7] Restored last MC job ${jobIdShort} — CEP50 ${(latestData.cep_guided_50 || 0).toFixed(1)} m (${latestData.runs} rounds)`, 'info');
                }, 800);
            }
        } catch (e) {
            // Non-fatal: no previous job found, silently continue
        }
    })();

    // Sound Synthesizer via Web Audio API (Low-frequency tactical sweeps)
    let audioCtx = null;
    function playAudioTone(freq, type = 'sine', duration = 0.2) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    
    // 2. Tab Navigation Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
            document.body.setAttribute('data-active-tab', targetId);
            
            if (targetId === 'tab-audit') {
                renderAuditLogs();
            }
            
            // Resize canvases for the newly activated tab
            if (targetId === 'tab-simulator') {
                if (typeof resizeCanvas === 'function') resizeCanvas();
                if (typeof drawTrajectoryCanvas === 'function') drawTrajectoryCanvas();
            } else if (targetId === 'tab-hardware') {
                if (typeof trigger3DResize === 'function') trigger3DResize();
            } else if (targetId === 'tab-cep') {
                const canvasCEP = document.getElementById('canvas-cep-heatmap');
                if (canvasCEP && canvasCEP.parentElement) {
                    canvasCEP.width = canvasCEP.parentElement.clientWidth;
                    canvasCEP.height = canvasCEP.parentElement.clientHeight;
                    if (typeof renderMonteCarloCanvas === 'function') renderMonteCarloCanvas();
                }
            }
        });
    });

    // CEP Sub-view Navigation Logic
    const cepModeSelect = document.getElementById('cep-mode-select');
    if (cepModeSelect) {
        cepModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            // Hide all sub-views
            document.getElementById('cep-view-mc').style.display = 'none';
            document.getElementById('cep-view-eb').style.display = 'none';
            document.getElementById('cep-view-sweep').style.display = 'none';
            
            // Show selected sub-view
            if (mode === 'mode-mc') {
                document.getElementById('cep-view-mc').style.display = 'block';
                // Trigger resize for canvas
                const canvasCEP = document.getElementById('canvas-cep-heatmap');
                if (canvasCEP && canvasCEP.parentElement) {
                    canvasCEP.width = canvasCEP.parentElement.clientWidth;
                    canvasCEP.height = canvasCEP.parentElement.clientHeight;
                    if (typeof renderMonteCarloCanvas === 'function') renderMonteCarloCanvas();
                }
            } else if (mode === 'mode-eb') {
                document.getElementById('cep-view-eb').style.display = 'block';
            } else if (mode === 'mode-sweep') {
                document.getElementById('cep-view-sweep').style.display = 'block';
            }
        });
    }

// Render KaTeX Math Equations
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ]
        });
    }

    // 3. UI Element Sliders Binding
    const inputAngle = document.getElementById('input-angle');
    const valAngle = document.getElementById('val-angle');
    const inputDistance = document.getElementById('input-distance');
    const valDistance = document.getElementById('val-distance');
    const inputWindX = document.getElementById('input-wind-x');
    const valWindX = document.getElementById('val-wind-x');
    const inputWindZ = document.getElementById('input-wind-z');
    const valWindZ = document.getElementById('val-wind-z');
    const togglePgk = document.getElementById('toggle-pgk');
    const selectNavMode = document.getElementById('select-nav-mode');
    const btnProgramFuze = document.getElementById('btn-program-fuze');
    const btnFireSim = document.getElementById('btn-fire-sim');
    const btnResetSim = document.getElementById('btn-reset-sim');

    if (inputAngle && valAngle) {
        inputAngle.addEventListener('input', () => {
            valAngle.textContent = `${parseFloat(inputAngle.value).toFixed(1)}°`;
            engine.launchElevationDeg = parseFloat(inputAngle.value);
        });
    }

    if (inputDistance && valDistance) {
        inputDistance.addEventListener('input', () => {
            valDistance.textContent = `${parseFloat(inputDistance.value).toFixed(1)} km`;
            engine.targetDistance = parseFloat(inputDistance.value) * 1000;
            if (typeof logTerminal === 'function' && typeof isSimulating !== 'undefined' && isSimulating) {
                logTerminal(`[FCS] Target Distance updated to ${engine.targetDistance}m.`, 'info');
            }
        });
    }

    if (inputWindX && valWindX) {
        inputWindX.addEventListener('input', () => {
            const val = parseFloat(inputWindX.value);
            valWindX.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} m/s`;
            engine.windSpeedX = val;
            if (engine.isPGKEnabled && typeof logTerminal === 'function' && typeof isSimulating !== 'undefined' && isSimulating) {
                logTerminal(`[ENV] Wind (X) shifted to ${val} m/s. PGK Canards adjusting trajectory.`, 'info');
            }
            drawWindProfile();
        });
    }

    if (inputWindZ && valWindZ) {
        inputWindZ.addEventListener('input', () => {
            const val = parseFloat(inputWindZ.value);
            valWindZ.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} m/s`;
            engine.windSpeedZ = val;
            if (engine.isPGKEnabled && typeof logTerminal === 'function' && typeof isSimulating !== 'undefined' && isSimulating) {
                logTerminal(`[ENV] Crosswind (Z) shifted to ${val} m/s. PGK Canards adjusting trajectory.`, 'info');
            }
        });
    }

    const selectScenario = document.getElementById('select-scenario');
    if (selectScenario) {
        selectScenario.addEventListener('change', () => {
            const scenario = selectScenario.value;
            let wx = 0;
            let wz = 0;
            
            if (scenario === 'baseline') {
                wx = 0; wz = 0;
            } else if (scenario === 'low_wind') {
                wx = 5; wz = 2;
            } else if (scenario === 'high_wind') {
                wx = 15; wz = -8;
            } else if (scenario === 'cross_wind') {
                wx = 2; wz = 15;
            }
            
            engine.windSpeedX = wx;
            engine.windSpeedZ = wz;
            
            if (inputWindX && valWindX) { 
                inputWindX.value = wx; 
                valWindX.textContent = `${wx >= 0 ? '+' : ''}${wx.toFixed(1)} m/s`; 
            }
            if (inputWindZ && valWindZ) { 
                inputWindZ.value = wz; 
                valWindZ.textContent = `${wz >= 0 ? '+' : ''}${wz.toFixed(1)} m/s`; 
            }
            
            drawWindProfile();
            
            if (typeof logTerminal === 'function') {
                logTerminal(`[ENV] Scenario loaded: ${selectScenario.options[selectScenario.selectedIndex].text}`, 'info');
            }
        });
    }


    // Altitude Wind Shear bindings
    const toggleWindShear = document.getElementById('toggle-wind-shear');
    const windShearControls = document.getElementById('wind-shear-controls');
    const inputWindLow = document.getElementById('input-wind-low');
    const valWindLow = document.getElementById('val-wind-low');
    const inputWindMed = document.getElementById('input-wind-med');
    const valWindMed = document.getElementById('val-wind-med');
    const inputWindHigh = document.getElementById('input-wind-high');
    const valWindHigh = document.getElementById('val-wind-high');

    if (toggleWindShear) {
        toggleWindShear.addEventListener('change', () => {
            const enabled = toggleWindShear.checked;
            engine.isWindShearEnabled = enabled;
            windShearControls.style.display = enabled ? 'flex' : 'none';
            playAudioTone(850, 'sine', 0.05);
            drawWindProfile();
        });
    }
    if (inputWindLow) {
        inputWindLow.addEventListener('input', () => {
            const val = parseFloat(inputWindLow.value);
            valWindLow.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} m/s`;
            engine.windLowX = val;
            drawWindProfile();
        });
    }
    if (inputWindMed) {
        inputWindMed.addEventListener('input', () => {
            const val = parseFloat(inputWindMed.value);
            valWindMed.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} m/s`;
            engine.windMedX = val;
            drawWindProfile();
        });
    }
    if (inputWindHigh) {
        inputWindHigh.addEventListener('input', () => {
            const val = parseFloat(inputWindHigh.value);
            valWindHigh.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} m/s`;
            engine.windHighX = val;
            drawWindProfile();
        });
    }

    function drawWindProfile() {
        const canvas = document.getElementById('wind-profile-graph');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        
        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
        ctx.stroke();

        const maxWind = 35;
        const pts = [];
        
        // 0km, 4km, 8km, 12km
        const altitudes = [0, 4000, 8000, 12000];
        altitudes.forEach((alt, i) => {
            let wind = 0;
            if (!engine.isWindShearEnabled) wind = engine.windSpeedX;
            else {
                if (alt < 4000) wind = engine.windLowX;
                else if (alt < 8000) wind = engine.windMedX;
                else wind = engine.windHighX;
            }
            
            const px = w/2 + (wind / maxWind) * (w/2);
            const py = h - (alt / 12000) * h;
            pts.push({px, py});
        });

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, i) => {
            if (i===0) ctx.moveTo(p.px, p.py);
            else ctx.lineTo(p.px, p.py);
        });
        ctx.stroke();
    }

    // Coriolis UI Slider bindings
    const inputAzimuth = document.getElementById('input-azimuth');
    const valAzimuth = document.getElementById('val-azimuth');
    const inputLatitude = document.getElementById('input-latitude');
    const valLatitude = document.getElementById('val-latitude');

    if (inputAzimuth) {
        inputAzimuth.addEventListener('input', () => {
            const val = parseFloat(inputAzimuth.value);
            let dir = 'N';
            if (val > 0 && val < 90) dir = 'NE';
            else if (val === 90) dir = 'E';
            else if (val > 90 && val < 180) dir = 'SE';
            else if (val === 180) dir = 'S';
            else if (val > 180 && val < 270) dir = 'SW';
            else if (val === 270) dir = 'W';
            else if (val > 270 && val < 360) dir = 'NW';
            
            valAzimuth.textContent = `${val.toFixed(1)}° ${dir}`;
            engine.firingAzimuthDeg = val;
        });
    }

    if (inputLatitude) {
        inputLatitude.addEventListener('input', () => {
            const val = parseFloat(inputLatitude.value);
            const hemisphere = val >= 0 ? 'N' : 'S';
            valLatitude.textContent = `${Math.abs(val).toFixed(1)}° ${hemisphere}`;
            engine.latitudeDeg = val;
        });
    }

    if (togglePgk) {
        togglePgk.addEventListener('change', () => {
            engine.isPGKEnabled = togglePgk.checked;
            const hudMode = document.getElementById('hud-mode');
            if (hudMode) hudMode.textContent = togglePgk.checked ? 'PGK GUIDED CANARD' : 'UNGUIDED BALLISTIC';
        });
    }

    if (selectNavMode) {
        selectNavMode.addEventListener('change', () => {
            engine.navigationMode = selectNavMode.value;
            const dot = document.getElementById('status-gnss-dot');
            const text = document.getElementById('status-gnss-text');
            if (selectNavMode.value === 'DENIED' || selectNavMode.value === 'DEGRADED') {
                if (dot) dot.classList.add('warning');
                if (text) {
                    text.textContent = selectNavMode.value === 'DENIED' ? 'GNSS: DENIED (INS FALLBACK)' : 'GNSS: DEGRADED (HIGH NOISE)';
                    text.style.color = 'var(--tactical-amber)';
                }
            } else {
                if (dot) dot.classList.remove('warning');
                if (text) {
                    text.textContent = 'GNSS: LOCK (12 SAT)';
                    text.style.color = 'var(--text-dim)';
                }
            }
        });
    }


    // Vision Environment Filter Toggles (Daylight, FLIR Thermal, Desert Haze)
    const envBtns = document.querySelectorAll('.env-btn');
    const canvasWrapper = document.getElementById('visualizer-canvas-wrapper');
    envBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            envBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const envMode = btn.getAttribute('data-env');
            if (canvasWrapper) {
                canvasWrapper.classList.remove('flir-filter-active', 'duststorm-filter-active');
                if (envMode === 'FLIR') {
                    canvasWrapper.classList.add('flir-filter-active');
                } else if (envMode === 'DUSTSTORM') {
                    canvasWrapper.classList.add('duststorm-filter-active');
                }
            }
            if (window.tacticalAudio) window.tacticalAudio.playLockPing();
        });
    });

    // Subassembly Component Selector Toggles (Tab 3 PGK Assembly)
    const componentBtns = document.querySelectorAll('.component-pill-btn');
    componentBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            componentBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const partKey = btn.getAttribute('data-part');
            if (window.tacticalAudio) window.tacticalAudio.playCanardServo();
            const nodeEl = document.querySelector(`.component-node[data-component="${partKey}"]`);
            if (nodeEl) nodeEl.click();
            if (window.shellModel3D) {
                window.shellModel3D.highlightPart(partKey);
            }
        });
    });



    // 4. Trajectory Canvas 2D/3D Hybrid Visualizer & Console Logger
    const canvasTraj = document.getElementById('canvas-trajectory');
    const ctxTraj = canvasTraj.getContext('2d');
    const btnToggleViewMode = document.getElementById('btn-toggle-view-mode');
    const terminalLog = document.getElementById('terminal-console-log');
    
    let animFrameId = null;
    let isSimulating = false;
    let viewMode = '2D'; // '2D', '3D', or 'CHASE'

    // Feature state variables (declared here to ensure scope access in all handlers)
    let isComparisonMode = false;
    let engine2 = null;
    let detonationVFX = null;
    let chartHistory = { alt: [], vel: [], g: [], canard: [] };
    let ewSweepTime = 0;
    let isShellInJammingZone = false;


    // Mouse control parameters for 3D trajectory view
    let trajRotX = 0.25;
    let trajRotY = -0.45;
    let trajDragging = false;
    let trajPrevX = 0, trajPrevY = 0;

    canvasTraj.addEventListener('mousedown', (e) => {
        if (viewMode === '3D') {
            trajDragging = true;
            trajPrevX = e.clientX;
            trajPrevY = e.clientY;
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (trajDragging && viewMode === '3D') {
            const dx = e.clientX - trajPrevX;
            const dy = e.clientY - trajPrevY;
            trajRotY += dx * 0.007;
            trajRotX += dy * 0.007;
            trajRotX = Math.max(-0.6, Math.min(0.6, trajRotX));
            trajPrevX = e.clientX;
            trajPrevY = e.clientY;
            drawTrajectoryCanvas();
        }
    });
    window.addEventListener('mouseup', () => { trajDragging = false; });

    const btnToggleCesium = document.getElementById('btn-toggle-cesium');
    const cesiumContainer = document.getElementById('cesium-container');
    const cesiumPresetsGroup = document.getElementById('cesium-presets-group');
    const btnCesiumGround = document.getElementById('btn-cesium-preset-ground');
    const btnCesiumApex = document.getElementById('btn-cesium-preset-apex');
    const btnCesiumTarget = document.getElementById('btn-cesium-preset-target');

    if (btnToggleCesium) {
        btnToggleCesium.addEventListener('click', () => {
            if (viewMode !== 'CESIUM') {
                viewMode = 'CESIUM';
                if (btnToggleViewMode) btnToggleViewMode.textContent = 'Switch to 3D Path';
                if (cesiumPresetsGroup) cesiumPresetsGroup.style.display = 'flex';
                logTerminal('[GIS] Pokhran Field Firing Range 3D Satellite Terrain Engine ACTIVATED.', 'success');
                // CRITICAL: Must show container BEFORE Cesium init so WebGL gets real dimensions
                if (cesiumContainer) {
                    cesiumContainer.style.display = 'block';
                }
                if (window.aegisCesium && !window.aegisCesium.isInitialized) {
                    window.aegisCesium.init();
                } else if (window.aegisCesium) {
                    window.aegisCesium.resize();
                }
            } else {
                viewMode = '2D';
                if (cesiumPresetsGroup) cesiumPresetsGroup.style.display = 'none';
            }
            drawTrajectoryCanvas();
            if (window.tacticalAudio) window.tacticalAudio.playLockPing();
        });
    }

    if (btnCesiumGround) {
        btnCesiumGround.addEventListener('click', () => {
            if (window.aegisCesium) window.aegisCesium.flyToPreset('GROUND');
        });
    }
    if (btnCesiumApex) {
        btnCesiumApex.addEventListener('click', () => {
            if (window.aegisCesium) window.aegisCesium.flyToPreset('APEX');
        });
    }
    if (btnCesiumTarget) {
        btnCesiumTarget.addEventListener('click', () => {
            if (window.aegisCesium) window.aegisCesium.flyToPreset('TARGET');
        });
    }

    if (btnToggleViewMode) {
        btnToggleViewMode.addEventListener('click', () => {
            if (cesiumPresetsGroup) cesiumPresetsGroup.style.display = 'none';
            if (viewMode === '2D' || viewMode === 'CESIUM') {
                viewMode = '3D';
                btnToggleViewMode.textContent = 'Switch to Chase Cam';
            } else if (viewMode === '3D') {
                viewMode = 'CHASE';
                btnToggleViewMode.textContent = 'Switch to 2D Path';
            } else {
                viewMode = '2D';
                btnToggleViewMode.textContent = 'Switch to 3D Path';
            }
            drawTrajectoryCanvas();
            playAudioTone(900, 'sine', 0.05);
        });
    }

    // Command Terminal Console Logger helper
    let loggedMilestones = {};
    function logTerminal(message, type = 'info') {
        if (!terminalLog) return;
        const color = type === 'success' ? '#00ff66' : (type === 'warn' ? 'var(--tactical-amber)' : (type === 'error' ? 'var(--tactical-red)' : '#00e5ff'));
        const timeStr = engine.state ? engine.state.time.toFixed(3) : '0.000';
        
        const logEntry = document.createElement('div');
        logEntry.style.color = color;
        logEntry.innerHTML = `<span style="color: var(--text-dim);">[T+${timeStr}s]</span> ${message}`;
        terminalLog.appendChild(logEntry);
        terminalLog.scrollTop = terminalLog.scrollHeight;
    }

    function clearTerminal() {
        if (terminalLog) terminalLog.innerHTML = '';
        loggedMilestones = {};
        logTerminal('[SYSTEM] Power-on self test (POST) initialized...', 'info');

        // Reset ESAD UI
        const esadSteps = [
            { id: 'esad-step-1', text: '🛡️ [SAFE] System Inert' },
            { id: 'esad-step-2', text: '⏳ [SELF TEST] PENDING' },
            { id: 'esad-step-3', text: '⏳ [LAUNCH EVENT DETECTED] PENDING' },
            { id: 'esad-step-4', text: '⏳ [SPIN CONFIRMATION] PENDING' },
            { id: 'esad-step-5', text: '⏳ [FLIGHT CONFIRMATION] PENDING' },
            { id: 'esad-step-6', text: '⏳ [SIMULATION-ARMED] PENDING' },
            { id: 'esad-step-7', text: '⏳ [EVENT DETECTION] PENDING' },
            { id: 'esad-step-8', text: '⏳ [EVENT LOGGED] PENDING' }
        ];
        esadSteps.forEach(step => {
            const el = document.getElementById(step.id);
            if (el) {
                el.style.background = 'rgba(255,255,255,0.05)';
                el.style.borderColor = 'var(--border-color)';
                el.style.color = 'var(--text-secondary)';
                el.innerHTML = step.text;
            }
        });
        const statusText = document.getElementById('status-esad-text');
        const statusDot = document.getElementById('status-esad-dot');
        if (statusText) statusText.textContent = 'ESAD: SAFE';
        if (statusDot) statusDot.style.background = 'var(--text-secondary)';
    }

    // Synthetic Telemetry Sound Loop via Web Audio API
    let telemetryInterval = null;
    let windNoiseNode = null;
    function startFlightAudio() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 1. Create Telemetry Periodic Chirps
            telemetryInterval = setInterval(() => {
                if (isSimulating) playAudioTone(2200, 'sine', 0.02);
            }, 1200);

            // 2. Create Flight Wind Hum (Low pass brown noise)
            const bufferSize = 2 * audioCtx.sampleRate;
            const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            const whiteNoise = audioCtx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 350;

            const gain = audioCtx.createGain();
            gain.gain.value = 0.03;

            whiteNoise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            whiteNoise.start();

            windNoiseNode = { source: whiteNoise, gain: gain };
        } catch (e) {}
    }

    function stopFlightAudio() {
        if (telemetryInterval) clearInterval(telemetryInterval);
        if (windNoiseNode) {
            try {
                windNoiseNode.source.stop();
            } catch (e) {}
        }
    }

    function resizeCanvas() {
        if (!canvasTraj) return;
        const rect = canvasTraj.parentElement.getBoundingClientRect();
        canvasTraj.width = rect.width;
        canvasTraj.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    drawWindProfile();

    let drawTrajectoryCanvas = function() {
        if (!canvasTraj) return;
        const w = canvasTraj.width;
        const h = canvasTraj.height;

        const canvas2D = document.getElementById('canvas-trajectory');
        const canvas3DContainer = document.getElementById('canvas-trajectory-3d');
        const cesiumContainer = document.getElementById('cesium-container');

        if (viewMode === '3D' || viewMode === 'CHASE') {
            if (canvas2D) canvas2D.style.display = 'none';
            if (canvas3DContainer) canvas3DContainer.style.display = 'block';
            if (cesiumContainer) cesiumContainer.style.display = 'none';
            if (typeof updateWebGLFlightVisualizer === 'function') {
                updateWebGLFlightVisualizer();
            }
            return;
        } else if (viewMode === 'CESIUM') {
            if (canvas2D) canvas2D.style.display = 'none';
            if (canvas3DContainer) canvas3DContainer.style.display = 'none';
            if (cesiumContainer) cesiumContainer.style.display = 'block';
            if (window.aegisCesium) {
                const limit1 = typeof engine.playbackIndex !== 'undefined' ? engine.playbackIndex : engine.history.length;
                const hist1 = engine.history ? engine.history.slice(0, Math.max(1, limit1)) : [];
                
                let hist2 = null;
                if (typeof isComparisonMode !== 'undefined' && isComparisonMode && engine2 && engine2.history) {
                    const limit2 = typeof engine2.playbackIndex !== 'undefined' ? engine2.playbackIndex : engine2.history.length;
                    hist2 = engine2.history.slice(0, Math.max(1, limit2));
                }
                
                const coords1 = hist1.map(s => [s.x, s.y, s.z]);
                window.aegisCesium.drawTrajectory(coords1, false);
                if (hist2) {
                    const coords2 = hist2.map(s => [s.x, s.y, s.z]);
                    window.aegisCesium.drawTrajectory(coords2, true);
                }
            }
            return;
        } else {
            if (canvas2D) canvas2D.style.display = 'block';
            if (canvas3DContainer) canvas3DContainer.style.display = 'none';
            if (cesiumContainer) cesiumContainer.style.display = 'none';
        }

        ctxTraj.fillStyle = '#06080D';
        ctxTraj.fillRect(0, 0, w, h);

        const maxDist = 32000;
        const maxAlt = 14000;
        const paddingBottom = 40;
        const paddingLeft = 50;

        // Draw 2D Radar sweep lines
        ctxTraj.strokeStyle = 'rgba(0, 229, 255, 0.04)';
        ctxTraj.lineWidth = 1;
        const centerRadarX = w / 2;
        const centerRadarY = h - 40;
        for (let r = 80; r < w; r += 120) {
            ctxTraj.beginPath();
            ctxTraj.arc(centerRadarX, centerRadarY, r, Math.PI, 2 * Math.PI);
            ctxTraj.stroke();
        }

        // Radar vertical/horizontal line sweeps
        ctxTraj.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        for (let x = 0; x < w; x += 50) {
            ctxTraj.beginPath(); ctxTraj.moveTo(x, 0); ctxTraj.lineTo(x, h); ctxTraj.stroke();
        }
        for (let y = 0; y < h; y += 50) {
            ctxTraj.beginPath(); ctxTraj.moveTo(0, y); ctxTraj.lineTo(w, y); ctxTraj.stroke();
        }

        function worldToScreen(wx, wy) {
            const sx = paddingLeft + (wx / maxDist) * (w - paddingLeft - 40);
            const sy = (h - paddingBottom) - (wy / maxAlt) * (h - paddingBottom - 40);
            return { sx, sy };
        }

        // Draw Ground baseline
        const groundY = h - paddingBottom;
        ctxTraj.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctxTraj.lineWidth = 1.5;
        ctxTraj.beginPath(); ctxTraj.moveTo(0, groundY); ctxTraj.lineTo(w, groundY); ctxTraj.stroke();

        // Target Crosshair
        const targetPt = worldToScreen(engine.targetDistance, engine.targetAltitude);
        ctxTraj.strokeStyle = 'var(--tactical-red)';
        ctxTraj.lineWidth = 1.5;
        ctxTraj.beginPath();
        ctxTraj.arc(targetPt.sx, targetPt.sy, 10, 0, Math.PI * 2);
        ctxTraj.moveTo(targetPt.sx - 15, targetPt.sy); ctxTraj.lineTo(targetPt.sx + 15, targetPt.sy);
        ctxTraj.moveTo(targetPt.sx, targetPt.sy - 15); ctxTraj.lineTo(targetPt.sx, targetPt.sy + 15);
        ctxTraj.stroke();

        ctxTraj.fillStyle = 'var(--tactical-red)';
        ctxTraj.font = '10px "JetBrains Mono"';
        ctxTraj.fillText(`TARGET: ${(engine.targetDistance / 1000).toFixed(1)} km`, targetPt.sx + 18, targetPt.sy - 5);

        // Trajectory Trail
        if (engine.history && engine.history.length > 0) {
            ctxTraj.beginPath();
            ctxTraj.lineWidth = 2.0;
            ctxTraj.strokeStyle = engine.isPGKEnabled ? '#00e5ff' : '#ff5a00';

            const limit = typeof engine.playbackIndex !== 'undefined' ? engine.playbackIndex : engine.history.length;
            for (let i = 0; i < limit; i++) {
                const pt = worldToScreen(engine.history[i].x, engine.history[i].y);
                if (i === 0) ctxTraj.moveTo(pt.sx, pt.sy);
                else ctxTraj.lineTo(pt.sx, pt.sy);
            }
            ctxTraj.stroke();

            // Draw Shell Head
            const s = engine.state;
            if (s) {
                const headPt = worldToScreen(s.x, s.y);
                ctxTraj.save();
                ctxTraj.translate(headPt.sx, headPt.sy);
                ctxTraj.rotate(-s.pitch * Math.PI / 180);

                ctxTraj.fillStyle = 'var(--text-terminal)';
                ctxTraj.beginPath();
                ctxTraj.arc(8, 0, 3, -Math.PI / 2, Math.PI / 2);
                ctxTraj.rect(-6, -3, 14, 6);
                ctxTraj.fill();

                if (engine.isPGKEnabled && Math.abs(s.canardPitchDeg) > 0.1) {
                    ctxTraj.fillStyle = 'var(--tactical-amber)';
                    ctxTraj.fillRect(1, -7, 1.5, 14);
                }
                ctxTraj.restore();
            }
        }

        // ---- EW Radar Threats Overlay (2D Mode only) ----
        if (typeof drawEWRadarThreats === 'function') {
            drawEWRadarThreats(ctxTraj, w, h, worldToScreen, maxDist, 14000);
        }

        // ---- Detonation Particle VFX (2D Mode only) ----
        if (typeof detonationVFX !== 'undefined' && detonationVFX) {
            detonationVFX.update(0.025);
            detonationVFX.draw(ctxTraj);
            if (detonationVFX.isDone()) detonationVFX = null;
        }

        // ---- Comparison Mode: Unguided shell trail (2D Mode only) ----
        if (typeof isComparisonMode !== 'undefined' && isComparisonMode && engine2 && engine2.history && engine2.history.length > 1) {
            ctxTraj.beginPath();
            ctxTraj.lineWidth = 2.0;
            ctxTraj.strokeStyle = 'rgba(255,150,0,0.75)';
            
            const limit2 = typeof engine2.playbackIndex !== 'undefined' ? engine2.playbackIndex : engine2.history.length;
            for (let i = 0; i < limit2; i++) {
                const scr = worldToScreen(engine2.history[i].x, engine2.history[i].y);
                if (i === 0) ctxTraj.moveTo(scr.sx, scr.sy);
                else ctxTraj.lineTo(scr.sx, scr.sy);
            }
            ctxTraj.stroke();

            const s2 = engine2.state;
            if (s2 && !s2.detonated) {
                const hp = worldToScreen(s2.x, s2.y);
                ctxTraj.fillStyle = '#ff7800';
                ctxTraj.beginPath();
                ctxTraj.arc(hp.sx, hp.sy, 5, 0, Math.PI * 2);
                ctxTraj.fill();
            }

            ctxTraj.font = '9px "JetBrains Mono"';
            ctxTraj.fillStyle = '#00e5ff';
            ctxTraj.fillText('>>> PGK GUIDED', 10, 16);
            ctxTraj.fillStyle = '#ff7800';
            ctxTraj.fillText('>>> UNGUIDED', 10, 28);
        }
    }


    function updateTelemetryUI() {
        const s = engine.state;
        if (!s) return;

        const timeEl = document.getElementById('hud-time');
        const canardPEl = document.getElementById('hud-canard-p');
        const canardYEl = document.getElementById('hud-canard-y');
        const telemXEl = document.getElementById('telem-x');
        const telemYEl = document.getElementById('telem-y');
        const telemZEl = document.getElementById('telem-z');
        const telemSpeedEl = document.getElementById('telem-speed');
        const telemSpinEl = document.getElementById('telem-spin');
        const telemGEl = document.getElementById('telem-g');
        const telemInsEl = document.getElementById('telem-ins');

        if (timeEl) timeEl.textContent = `${s.time.toFixed(2)} s`;
        if (canardPEl) canardPEl.textContent = `${s.canardPitchDeg >= 0 ? '+' : ''}${s.canardPitchDeg.toFixed(1)}°`;
        if (canardYEl) canardYEl.textContent = `${s.canardYawDeg >= 0 ? '+' : ''}${s.canardYawDeg.toFixed(1)}°`;

        if (telemXEl) telemXEl.textContent = `${(s.x / 1000).toFixed(2)} km`;
        if (telemYEl) telemYEl.textContent = `${s.y.toFixed(0)} m`;
        if (telemZEl) telemZEl.textContent = `${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)} m`;
        if (telemSpeedEl) telemSpeedEl.textContent = `${s.speed.toFixed(0)} m/s (M${(s.speed / 340).toFixed(1)})`;
        if (telemSpinEl) telemSpinEl.textContent = `${(s.spinRateHz * 60).toFixed(0)} RPM`;
        if (telemGEl) telemGEl.textContent = `${s.gForceAxial.toFixed(1)} g`;
        
        // ESAD dynamic updates
        if (isSimulating) {
            const step3 = document.getElementById('esad-step-3'); // Launch detected
            const step4 = document.getElementById('esad-step-4'); // Spin confirmation
            const step5 = document.getElementById('esad-step-5'); // Flight Confirmation
            const step6 = document.getElementById('esad-step-6');
            
            // Sync with backend ESAD state machine thresholds
            if (s.gForceAxial > 10000 && step3) {
                step3.innerHTML = '✅ [LAUNCH EVENT DETECTED] SATISFIED';
                step3.style.borderColor = 'var(--op-green)';
                step3.style.color = 'var(--op-green)';
            }
            if (s.spinRateHz > 150 && step4) {
                step4.innerHTML = '✅ [SPIN CONFIRMATION] SATISFIED';
                step4.style.borderColor = 'var(--op-green)';
                step4.style.color = 'var(--op-green)';
            }
            if (s.time > 1.5 && step5) {
                step5.innerHTML = '✅ [FLIGHT CONFIRMATION] SATISFIED';
                step5.style.borderColor = 'var(--op-green)';
                step5.style.color = 'var(--op-green)';
            }
            if (s.isArmed && step6) {
                step6.innerHTML = '✅ [SIMULATION-ARMED] ARMED';
                step6.style.borderColor = 'var(--tactical-red)';
                step6.style.color = 'var(--tactical-red)';
                
                const statusText = document.getElementById('status-esad-text');
                const statusDot = document.getElementById('status-esad-dot');
                if (statusText) statusText.textContent = 'ESAD: ARMED';
                if (statusDot) statusDot.style.background = 'var(--tactical-red)';
            }
        }

        if (telemInsEl) telemInsEl.textContent = `${Math.sqrt(s.insDriftErrorX * s.insDriftErrorX + s.insDriftErrorZ * s.insDriftErrorZ).toFixed(2)} m`;

        // Update Cockpit Glass HUD Tapes
        const machValEl = document.getElementById('hud-mach-val');
        const mpsValEl = document.getElementById('hud-mps-val');
        const altValEl = document.getElementById('hud-alt-val');
        const gValEl = document.getElementById('hud-g-val');
        const glassLayer = document.getElementById('hud-glass-layer');

        if (glassLayer) {
            glassLayer.style.display = (viewMode === '3D' || viewMode === 'CHASE') ? 'flex' : 'none';
        }
        if (machValEl) machValEl.textContent = `MACH ${(s.speed / 340).toFixed(2)}`;
        if (mpsValEl) mpsValEl.textContent = `${s.speed.toFixed(0)} m/s`;
        if (altValEl) altValEl.textContent = `${s.y.toFixed(0)} m`;
        if (gValEl) gValEl.textContent = `GAX: ${s.gForceAxial.toFixed(1)} g`;

        if (s.detonated) {
            const targetDx = s.x - engine.targetDistance;
            const targetDz = s.z;
            const missDist = Math.sqrt(targetDx * targetDx + targetDz * targetDz);
            const errEl = document.getElementById('telem-error');
            if (errEl) {
                errEl.textContent = `${missDist.toFixed(1)} m Miss`;
                errEl.style.color = missDist < 10 ? '#00ff66' : 'var(--tactical-red)';
            }
        }

        // Live Log Milestones during simulation
        if (s.time < 0.05 && !loggedMilestones['boot']) {
            loggedMilestones['boot'] = true;
            logTerminal('[BOOT] Embedded Aegis OS v4.1 initialized.', 'success');
            logTerminal(`[CORIOLIS] Earth Rotation Compensation: Azimuth=${engine.firingAzimuthDeg.toFixed(1)}° NE, Lat=${engine.latitudeDeg.toFixed(1)}° ${engine.latitudeDeg>=0?'N':'S'}. EKF bias loaded.`, 'info');
            
            if (s.gForceAxial > 12000) {
                logTerminal(`[ESAD] Peak setback force detected: ${s.gForceAxial}g. Check: PASSED.`, 'success');
                const step3 = document.getElementById('esad-step-3');
                if (step3) {
                    step3.innerHTML = '✅ [LAUNCH EVENT DETECTED] SATISFIED';
                    step3.style.borderColor = 'var(--op-green)';
                    step3.style.color = 'var(--op-green)';
                }
            }
        }
        if (s.time > 0.5 && !loggedMilestones['spin']) {
            loggedMilestones['spin'] = true;
            logTerminal(`[ESAD] Decoupled spin stabilised at: ${(s.spinRateHz*60).toFixed(0)} RPM. Collar lock released.`, 'success');
            const step4 = document.getElementById('esad-step-4');
            if (step4) {
                step4.innerHTML = '✅ [SPIN CONFIRMATION] SATISFIED';
                step4.style.borderColor = 'var(--op-green)';
                step4.style.color = 'var(--op-green)';
            }
        }
        if (s.time > 3.0 && !loggedMilestones['armed']) {
            loggedMilestones['armed'] = true;
            logTerminal('[ESAD] Muzzle safety separation distance achieved. Flight Confirmation. Status: ARMED.', 'warn');
            const step5 = document.getElementById('esad-step-5');
            const step6 = document.getElementById('esad-step-6');
            if (step5) {
                step5.innerHTML = '✅ [FLIGHT CONFIRMATION] SATISFIED';
                step5.style.borderColor = 'var(--op-green)';
                step5.style.color = 'var(--op-green)';
            }
            if (step6) {
                step6.innerHTML = '✅ [SIMULATION-ARMED] SATISFIED';
                step6.style.borderColor = 'var(--tactical-orange)';
                step6.style.color = 'var(--tactical-orange)';
            }
            
            const statusText = document.getElementById('status-esad-text');
            const statusDot = document.getElementById('status-esad-dot');
            if (statusText) statusText.textContent = 'ESAD: ARMED';
            if (statusDot) statusDot.style.background = 'var(--accent-amber)';
        }
        if (s.time > 8.0 && !loggedMilestones['gnss']) {
            loggedMilestones['gnss'] = true;
            if (engine.navigationMode === 'DENIED') {
                logTerminal('[NAV] GNSS L1/L2 lock BLOCKED. Electronic Jamming detected. Switching to INS EKF integration.', 'error');
            } else if (engine.navigationMode === 'DEGRADED') {
                logTerminal('[NAV] GNSS L1/L2 degraded. High noise environment.', 'warning');
            } else {
                logTerminal('[NAV] NavIC/GPS Satellite tracking lock established. Initialising EKF state estimator.', 'success');
            }
        }
        if (s.time > 15.0 && s.time < 15.1 && !loggedMilestones['canard']) {
            loggedMilestones['canard'] = true;
            if (s.pgkActive) {
                logTerminal('[GUID] Proportional Navigation loop engaged. Actuating aerodynamic canards.', 'info');
            }
        }
        if (s.detonated && !loggedMilestones['detonated']) {
            loggedMilestones['detonated'] = true;
            if (window.tacticalAudio) window.tacticalAudio.playImpactExplosion();
            logTerminal(`[DET] Target destination reached. Triggering fuze: ${s.detonationMode}.`, 'warn');
            logTerminal(`[SYSTEM] Telemetry session closed. Miss distance: ${Math.sqrt(Math.pow(s.x-engine.targetDistance,2)+Math.pow(s.z,2)).toFixed(1)} m.`, 'success');
        }
    }

    let stepAnimationLoop = function() {
        // Implementation assigned below after feature initialization
    };


    if (btnProgramFuze) {
        btnProgramFuze.addEventListener('click', () => {
            logTerminal('[FUZE] Inductive setter connected...', 'amber');
            setTimeout(() => logTerminal('[FUZE] Uploading flight profile...', 'amber'), 500);
            setTimeout(() => {
                logTerminal(`[FUZE] Profile accepted. Mode: ${engine.fuzeMode}`, 'green');
                logTerminal('[ESAD] Capacitor charging armed.', 'green');
                btnFireSim.disabled = false;
                btnProgramFuze.style.borderColor = 'var(--op-green)';
                btnProgramFuze.style.color = 'var(--op-green)';
                btnProgramFuze.innerHTML = '✅ FUZE PROGRAMMED';
            }, 1200);
            playAudioTone(3000, 'square', 0.05);
            setTimeout(() => playAudioTone(3200, 'square', 0.05), 200);
        });
    }

    function populateRawDataTable() {
        const tbody = document.getElementById('raw-data-table-body');
        if (!tbody || !engine.history) return;
        
        let html = '';
        // to prevent rendering 10,000 rows and crashing the DOM, we'll sample every N steps
        // The backend steps at dt=0.04 (25Hz) and we sample for display to keep DOM rendering fast.
        const stepSize = Math.max(1, Math.floor(engine.history.length / 500)); 
        
        for (let i = 0; i < engine.history.length; i += stepSize) {
            const state = engine.history[i];
            const v = state.speed;
            const mach = state.mach;
            
            html += `
                <tr style="border-bottom: 1px solid var(--border-steel); background: ${i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'};">
                    <td style="padding: 0.5rem; color: var(--text-primary); font-family: var(--font-mono);">${state.time.toFixed(2)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.x.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.y.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.z.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--accent-cyan); font-family: var(--font-mono);">${v.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-dim); font-family: var(--font-mono);">${mach.toFixed(2)}</td>
                </tr>
            `;
        }
        
        // Ensure final state is added
        if (engine.history.length > 0) {
            const state = engine.history[engine.history.length - 1];
            const v = state.speed;
            const mach = state.mach;
            html += `
                <tr style="border-bottom: 1px solid var(--border-steel); background: rgba(0,229,255,0.1);">
                    <td style="padding: 0.5rem; color: var(--text-primary); font-family: var(--font-mono);">${state.time.toFixed(2)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.x.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.y.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${state.z.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--accent-cyan); font-family: var(--font-mono);">${v.toFixed(1)}</td>
                    <td style="padding: 0.5rem; color: var(--text-dim); font-family: var(--font-mono);">${mach.toFixed(2)}</td>
                </tr>
            `;
        }
        
        tbody.innerHTML = html;
    }

    if (btnFireSim) {
        btnFireSim.addEventListener('click', async () => {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            clearTerminal();
            isComparisonMode = false;
            engine2 = null;
            detonationVFX = null;
            chartHistory = { alt: [], vel: [], g: [], canard: [] };
            isSimulating = true;
            if (window.tacticalAudio) window.tacticalAudio.playLaunch();
            playAudioTone(1100, 'square', 0.1);
            startFlightAudio();
            
            try {
                const payload = {
                    target_distance: engine.targetDistance,
                    launch_elevation_deg: engine.launchElevationDeg,
                    wind_speed_x: engine.windSpeedX,
                    wind_speed_z: engine.windSpeedZ,
                    latitude_deg: engine.latitudeDeg,
                    firing_azimuth_deg: engine.firingAzimuthDeg,
                    is_pgk_enabled: engine.isPGKEnabled,
                    is_wind_shear_enabled: engine.isWindShearEnabled,
                    wind_low_x: engine.windLowX,
                    wind_med_x: engine.windMedX,
                    wind_high_x: engine.windHighX,
                    fuze_mode: engine.fuzeMode,
                    fuze_delay_ms: engine.fuzeDelayMs || 0.0,
                    navigation_mode: engine.navigationMode || "NORMAL",
                    proximity_height: engine.proximityHeight || 12.0,
                    programmed_flight_time: engine.programmedFlightTime || 60.0
                };
                const res = await fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                engine.history = data.history;
                engine.state = data.final_state;
                engine.playbackIndex = 0;
                if (typeof populateRawDataTable === 'function') populateRawDataTable();
                stepAnimationLoop();
            } catch (e) {
                console.error(e);
                logTerminal('[ERROR] Backend connection failed.', 'error');
                isSimulating = false;
                stopFlightAudio();
            }
        });
    }


    if (btnResetSim) {
        btnResetSim.addEventListener('click', () => {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            isSimulating = false;
            isComparisonMode = false;
            engine2 = null;
            detonationVFX = null;
            chartHistory = { alt: [], vel: [], g: [], canard: [] };
            stopFlightAudio();
            clearTerminal();
            engine.initFlight();
            drawTrajectoryCanvas();
            updateTelemetryUI();
            drawTelemetryCharts();
        });
    }

    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (!engine.history || engine.history.length === 0) {
                alert("No flight data to export. Run a simulation first.");
                return;
            }
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Time_s,X_m,Y_m,Z_m,Speed_mps,Mach,Pitch_deg,Yaw_deg\n";
            engine.history.forEach(pt => {
                const speed = pt.speed;
                const mach = pt.mach;
                csvContent += `${pt.time.toFixed(2)},${pt.x.toFixed(2)},${pt.y.toFixed(2)},${pt.z.toFixed(2)},${speed.toFixed(2)},${mach.toFixed(2)},${pt.pitch.toFixed(2)},${pt.yaw.toFixed(2)}\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `aegis155_mission_log_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // ============================================================
    // FEATURE 4: DUAL COMPARISON FIRE MODE
    // ============================================================

    const btnComparisonFire = document.getElementById('btn-comparison-fire');

    if (btnComparisonFire) {
        btnComparisonFire.addEventListener('click', async () => {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            clearTerminal();
            detonationVFX = null;
            chartHistory = { alt: [], vel: [], g: [], canard: [] };
            isComparisonMode = true;

            isSimulating = true;
            if (window.tacticalAudio) window.tacticalAudio.playLaunch();
            playAudioTone(880, 'square', 0.15);
            playAudioTone(1100, 'square', 0.1);
            startFlightAudio();
            logTerminal('[COMP] Dual-fire comparison mode engaged. Firing PGK-guided and unguided shells simultaneously.', 'warn');
            
            try {
                const payload1 = {
                    target_distance: engine.targetDistance,
                    launch_elevation_deg: engine.launchElevationDeg,
                    wind_speed_x: engine.windSpeedX,
                    wind_speed_z: engine.windSpeedZ,
                    latitude_deg: engine.latitudeDeg,
                    firing_azimuth_deg: engine.firingAzimuthDeg,
                    is_pgk_enabled: true,
                    is_wind_shear_enabled: engine.isWindShearEnabled,
                    wind_low_x: engine.windLowX,
                    wind_med_x: engine.windMedX,
                    wind_high_x: engine.windHighX,
                    fuze_mode: engine.fuzeMode,
                    fuze_delay_ms: engine.fuzeDelayMs || 0.0
                };
                const payload2 = { ...payload1, is_pgk_enabled: false };
                
                const [res1, res2] = await Promise.all([
                    fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload1) }),
                    fetch('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) })
                ]);
                
                const data1 = await res1.json();
                const data2 = await res2.json();
                
                engine.history = data1.history;
                engine.state = data1.final_state;
                engine.playbackIndex = 0;
                
                if (!engine2) engine2 = { playbackIndex: 0 };
                engine2.history = data2.history;
                engine2.state = data2.final_state;
                engine2.history.forEach(pt => pt.z -= 50);
                engine2.state.z -= 50;
                
                stepAnimationLoop();
            } catch (e) {
                console.error(e);
                logTerminal('[ERROR] Backend connection failed.', 'error');
                isSimulating = false;
                stopFlightAudio();
            }
        });
    }


    class ParticleSystem {
        constructor(sx, sy, mode) {
            this.particles = [];
            this.rings = [];
            this.age = 0;
            this.sx = sx;
            this.sy = sy;
            this.mode = mode;
            const count = mode === 'PROXIMITY' ? 80 : 140;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 8;
                this.particles.push({
                    x: sx, y: sy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - (Math.random() * 4),
                    life: 0.8 + Math.random() * 1.2,
                    maxLife: 0,
                    size: 1.5 + Math.random() * 3.5,
                    color: Math.random() > 0.5 ? '#ff5a00' : (Math.random() > 0.5 ? '#ffb300' : '#ff3344'),
                    gravity: 0.12 + Math.random() * 0.08
                });
                this.particles[i].maxLife = this.particles[i].life;
            }
            this.rings.push({ r: 0, maxR: 120, alpha: 0.9, color: '#ff5a00' });
            this.rings.push({ r: 0, maxR: 80, alpha: 0.7, color: '#ffb300' });
            this.rings.push({ r: 0, maxR: 50, alpha: 0.6, color: '#00e5ff' });
        }

        update(dt) {
            this.age += dt;
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.life -= dt * 1.1;
            });
            this.particles = this.particles.filter(p => p.life > 0);
            this.rings.forEach(r => {
                r.r = Math.min(r.r + 4.5, r.maxR);
                r.alpha = Math.max(0, r.alpha - 0.022);
            });
        }

        draw(ctx) {
            // Impact crater glow
            const cradle = ctx.createRadialGradient(this.sx, this.sy, 0, this.sx, this.sy, 40);
            cradle.addColorStop(0, `rgba(255,120,0,${Math.max(0, 0.4 - this.age * 0.15)})`);
            cradle.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = cradle;
            ctx.beginPath();
            ctx.arc(this.sx, this.sy, 40, 0, Math.PI * 2);
            ctx.fill();

            // Shockwave rings
            this.rings.forEach(r => {
                ctx.strokeStyle = r.color.replace(')', `,${r.alpha})`).replace('rgb', 'rgba').replace('#ff5a00', `rgba(255,90,0,${r.alpha})`).replace('#ffb300', `rgba(255,179,0,${r.alpha})`).replace('#00e5ff', `rgba(0,229,255,${r.alpha})`);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.sx, this.sy, r.r, 0, Math.PI * 2);
                ctx.stroke();
            });

            // Particles
            this.particles.forEach(p => {
                const alpha = Math.max(0, p.life / p.maxLife);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1.0;
        }

        isDone() {
            return this.age > 3.5;
        }
    }

    // ============================================================
    // FEATURE 3: EW RADAR THREAT ENVIRONMENT
    // ============================================================
    const radarEmitters = [
        { xFrac: 0.25, yFrac: 0.0, rangeKm: 8.0, sweepAngle: 0, color: 'rgba(255,51,68,0.12)', labelColor: 'rgba(255,80,80,0.9)' },
        { xFrac: 0.60, yFrac: 0.0, rangeKm: 6.0, sweepAngle: Math.PI * 0.7, color: 'rgba(255,120,0,0.10)', labelColor: 'rgba(255,150,0,0.9)' },
        { xFrac: 0.85, yFrac: 0.0, rangeKm: 5.5, sweepAngle: Math.PI * 1.4, color: 'rgba(255,51,68,0.08)', labelColor: 'rgba(255,80,80,0.8)' }
    ];

    const inputEw1 = document.getElementById('input-ew1');
    const valEw1 = document.getElementById('val-ew1');
    const inputEw2 = document.getElementById('input-ew2');
    const valEw2 = document.getElementById('val-ew2');
    if (inputEw1) {
        inputEw1.addEventListener('input', () => {
            radarEmitters[0].rangeKm = parseFloat(inputEw1.value);
            valEw1.textContent = `${parseFloat(inputEw1.value).toFixed(1)} km`;
        });
    }
    if (inputEw2) {
        inputEw2.addEventListener('input', () => {
            radarEmitters[1].rangeKm = parseFloat(inputEw2.value);
            valEw2.textContent = `${parseFloat(inputEw2.value).toFixed(1)} km`;
        });
    }

    function drawEWRadarThreats(ctx, w, h, worldToScreen, maxDist, maxAlt) {
        ewSweepTime += 0.025;
        let shellInAnyZone = false;
        const s = engine.state;

        radarEmitters.forEach((emitter, idx) => {
            const emX = emitter.xFrac * maxDist;
            const emY = 0;
            const screenPos = worldToScreen(emX, emY);
            const rangeM = emitter.rangeKm * 1000;
            const screenRadius = (rangeM / maxDist) * (w - 90);

            // Fill jamming threat zone with subtle amber/red gradient
            const grad = ctx.createRadialGradient(screenPos.sx, screenPos.sy, 0, screenPos.sx, screenPos.sy, screenRadius);
            grad.addColorStop(0, idx === 0 ? 'rgba(255, 51, 68, 0.08)' : 'rgba(255, 179, 0, 0.06)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(screenPos.sx, screenPos.sy, screenRadius, 0, Math.PI * 2);
            ctx.fill();

            // Dashed boundary ring (clean military GIS style)
            ctx.strokeStyle = idx === 0 ? 'rgba(255, 51, 68, 0.45)' : 'rgba(255, 179, 0, 0.4)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(screenPos.sx, screenPos.sy, screenRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Emitter ground beacon dot
            ctx.fillStyle = idx === 0 ? '#FF3344' : '#FFB300';
            ctx.beginPath();
            ctx.arc(screenPos.sx, screenPos.sy, 4, 0, Math.PI * 2);
            ctx.fill();

            // Tactical Label
            ctx.fillStyle = emitter.labelColor;
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(`GNSS ECM-ZONE ${idx + 1} [${emitter.rangeKm.toFixed(1)}km]`, screenPos.sx + 8, screenPos.sy - 8);

            // Check if shell is inside jamming zone
            if (s && !s.detonated) {
                const shellX = s.x;
                const shellY = s.y;
                const distToEmitter = Math.sqrt(Math.pow(shellX - emX, 2) + Math.pow(shellY - emY, 2));
                if (distToEmitter < rangeM) {
                    shellInAnyZone = true;
                }
            }
        });

        // Update EW status
        if (shellInAnyZone !== isShellInJammingZone) {
            isShellInJammingZone = shellInAnyZone;
            engine.navigationMode = shellInAnyZone ? 'DENIED' : (selectNavMode ? selectNavMode.value : 'NORMAL');
            const ewStatus = document.getElementById('ew-radar-status');
            const ewChip = document.getElementById('ew-radar-chip');
            if (ewStatus) {
                if (shellInAnyZone) {
                    ewStatus.textContent = 'JAMMING';
                    if (ewChip) ewChip.style.borderColor = 'rgba(255,51,68,0.8)';
                    if (!loggedMilestones['ew_jam']) {
                        loggedMilestones['ew_jam'] = true;
                        logTerminal('[EW] Shell entered enemy jamming envelope. GNSS L1/L2 BLOCKED. INS fallback active.', 'error');
                    }
                } else {
                    ewStatus.textContent = 'CLEAR';
                    if (ewChip) ewChip.style.borderColor = 'rgba(255,90,0,0.4)';
                    if (loggedMilestones['ew_jam']) {
                        loggedMilestones['ew_jam_exit'] = true;
                        logTerminal('[EW] Shell exited jamming envelope. GNSS signal restored. EKF re-initialised.', 'success');
                    }
                }
            }
        }
    }

    // ============================================================
    // FEATURE 1: REAL-TIME TELEMETRY CHARTS
    // ============================================================
    const MAX_CHART_POINTS = 300;

    function pushChartData(s) {
        chartHistory.alt.push(s.y);
        chartHistory.vel.push(s.speed);
        chartHistory.g.push(Math.min(s.gForceAxial, 500)); // cap for readability
        chartHistory.canard.push(s.canardPitchDeg);
        if (chartHistory.alt.length > MAX_CHART_POINTS) {
            chartHistory.alt.shift();
            chartHistory.vel.shift();
            chartHistory.g.shift();
            chartHistory.canard.shift();
        }
    }

    function drawSingleChart(canvasId, data, color, label, unit, maxVal) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.parentElement.clientWidth || 200;
        const h = canvas.height = 60;
        ctx.fillStyle = '#040509';
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(0, h * i / 3); ctx.lineTo(w, h * i / 3); ctx.stroke();
        }

        if (data.length < 2) return;
        const computedMax = maxVal || Math.max(...data, 1);
        const computedMin = Math.min(...data, 0);
        const range = computedMax - computedMin || 1;

        // Filled area under curve
        const areaGrad = ctx.createLinearGradient(0, 0, 0, h);
        let alphaColor = 'rgba(0, 229, 255, 0.2)';
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            alphaColor = `rgba(${r}, ${g}, ${b}, 0.25)`;
        } else if (color.startsWith('rgb')) {
            alphaColor = color.replace(')', ', 0.25)').replace('rgb', 'rgba');
        } else {
            alphaColor = color;
        }
        areaGrad.addColorStop(0, alphaColor);
        areaGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.beginPath();
        data.forEach((val, i) => {
            const x = (i / (MAX_CHART_POINTS - 1)) * w;
            const y = h - ((val - computedMin) / range) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.lineTo((data.length - 1) / (MAX_CHART_POINTS - 1) * w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Line trace
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = (i / (MAX_CHART_POINTS - 1)) * w;
            const y = h - ((val - computedMin) / range) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Current value label
        const lastVal = data[data.length - 1];
        ctx.fillStyle = color;
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillText(`${lastVal.toFixed(0)}${unit}`, w - 50, 12);
    }

    function drawTelemetryCharts() {
        drawSingleChart('chart-altitude', chartHistory.alt, '#00e5ff', 'ALT', 'm', null);
        drawSingleChart('chart-velocity', chartHistory.vel, '#f59e0b', 'VEL', 'm/s', 900);
        drawSingleChart('chart-gforce', chartHistory.g, '#ff5a00', 'G', 'g', null);
        drawSingleChart('chart-canard', chartHistory.canard, '#a78bfa', 'DEF', '°', 15);
    }


    // Override stepAnimationLoop to integrate comparison mode
    stepAnimationLoop = function() {
        if (!isSimulating) return;

        let playbackSpeed = 2; // slow down the simulation playback
        
        for (let i = 0; i < playbackSpeed; i++) {
            if (engine.history && engine.playbackIndex < engine.history.length) {
                engine.state = engine.history[engine.playbackIndex];
                engine.playbackIndex++;
            }
            if (isComparisonMode && engine2 && engine2.history && engine2.playbackIndex < engine2.history.length) {
                engine2.state = engine2.history[engine2.playbackIndex];
                engine2.playbackIndex++;
            }
            
            const done1 = !engine.history || engine.playbackIndex >= engine.history.length;
            const done2 = !isComparisonMode || !engine2 || !engine2.history || engine2.playbackIndex >= engine2.history.length;
            
            if (done1 && done2) {
                if (engine.history && engine.history.length > 0) {
                    engine.state = engine.history[engine.history.length - 1];
                    engine.state.detonated = true;
                }
                if (isComparisonMode && engine2 && engine2.history && engine2.history.length > 0) {
                     engine2.state = engine2.history[engine2.history.length - 1];
                     engine2.state.detonated = true;
                }
                
                isSimulating = false;
                stopFlightAudio();
                playAudioTone(240, 'sawtooth', 0.5);

                if (viewMode === '2D') {
                    const w = canvasTraj.width;
                    const h = canvasTraj.height;
                    const maxDist = 32000;
                    const maxAlt = 14000;
                    const paddingBottom = 40;
                    const paddingLeft = 50;
                    const sx = paddingLeft + (engine.state.x / maxDist) * (w - paddingLeft - 40);
                    const sy = (h - paddingBottom) - (Math.max(0, engine.state.y) / maxAlt) * (h - paddingBottom - 40);
                    detonationVFX = new ParticleSystem(sx, sy, engine.fuzeMode);
                }

                if (isComparisonMode && engine2) {
                    const guided = Math.sqrt(Math.pow(engine.state.x - engine.targetDistance, 2) + Math.pow(engine.state.z, 2));
                    const unguided = Math.sqrt(Math.pow(engine2.state.x - engine.targetDistance, 2) + Math.pow(engine2.state.z, 2));
                    logTerminal(`[COMP] RESULT — PGK Guided: ${guided.toFixed(1)}m miss | Unguided: ${unguided.toFixed(1)}m miss`, 'warn');
                    logTerminal(`[COMP] PGK accuracy improvement: ${(unguided / Math.max(guided, 0.1)).toFixed(0)}x better CEP`, 'success');
                }
                break;
            }
        }
        // Push telemetry chart data
        if (engine.state) pushChartData(engine.state);

        drawTrajectoryCanvas();
        updateTelemetryUI();
        drawTelemetryCharts();

        // Ensure the 3D flight visualizer gets updated each frame
        if (typeof updateWebGLFlightVisualizer === 'function') {
            updateWebGLFlightVisualizer();
        }

        if (isSimulating) {
            animFrameId = requestAnimationFrame(stepAnimationLoop);
        } else {
            // Keep drawing VFX after detonation for a few seconds
            if (detonationVFX) {
                const runVFX = () => {
                    drawTrajectoryCanvas();
                    drawTelemetryCharts();
                    if (detonationVFX) requestAnimationFrame(runVFX);
                };
                requestAnimationFrame(runVFX);
            }
        }
    };

    // Initial Static Render
    engine.initFlight();
    drawTrajectoryCanvas();
    drawTelemetryCharts();


    // 5. Electronic Fuze Control Subsystem
    const fuzeModeSelects = document.querySelectorAll('.fuze-mode-select');
    const fuzeProxGroup = document.getElementById('fuze-prox-group');
    const fuzeDelayGroup = document.getElementById('fuze-delay-group');
    const inputHob = document.getElementById('input-hob');
    const valHob = document.getElementById('val-hob');
    const inputDelay = document.getElementById('input-delay');
    const inputTime = document.getElementById('input-time');
    const valTime = document.getElementById('val-time');
    if (inputTime && valTime) {
        inputTime.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            valTime.textContent = `${v.toFixed(1)} s`;
            engine.programmedFlightTime = v;
            logTerminal(`[FUZE] TIME mode programmed flight time set to ${v.toFixed(1)}s`, 'amber');
        });
    }

    const valDelay = document.getElementById('val-delay');
    const btnTestDetonation = document.getElementById('btn-test-detonation');



    fuzeModeSelects.forEach(btn => {
        btn.addEventListener('click', () => {
            fuzeModeSelects.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.getAttribute('data-mode');
            engine.fuzeMode = mode;

            if (fuzeProxGroup) fuzeProxGroup.style.display = mode === 'PROXIMITY' ? 'flex' : 'none';
            if (fuzeDelayGroup) fuzeDelayGroup.style.display = mode === 'DELAY' ? 'flex' : 'none';

            const waveTitle = document.getElementById('fuze-wave-title');
            if (waveTitle) {
                waveTitle.textContent = mode === 'PROXIMITY' ? 'FMCW Radar Proximity Sensor Waveforms (24.15 GHz)' : 'MEMS Accelerometer Peak Shock Pulse';
            }

            playAudioTone(850, 'sine', 0.05);
        });
    });

    if (inputHob && valHob) {
        inputHob.addEventListener('input', () => {
            valHob.textContent = `${inputHob.value}.0 m`;
            engine.proximityHeight = parseFloat(inputHob.value);
        });
    }

    if (inputDelay && valDelay) {
        inputDelay.addEventListener('input', () => {
            valDelay.textContent = `${inputDelay.value} ms`;
            engine.fuzeDelayMs = parseInt(inputDelay.value);
        });
    }

    const canvasFuzeWave = document.getElementById('canvas-fuze-wave');
    let fuzeAnimId = null;
    let waveOffset = 0;

    function animateFuzeWaveform() {
        if (!canvasFuzeWave) return;
        const ctx = canvasFuzeWave.getContext('2d');
        const w = canvasFuzeWave.width = canvasFuzeWave.parentElement.clientWidth || 400;
        const h = canvasFuzeWave.height = 180;

        ctx.fillStyle = '#06080D';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        // Draw grid
        for (let x = 0; x < w; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        waveOffset += 0.08;

        if (engine.fuzeMode === 'PROXIMITY') {
            // Tx Wave: Green chirp (modulating frequency)
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x < w; x++) {
                const t = x / w;
                const y = h / 4 + Math.sin(t * 70 + waveOffset + Math.sin(t * 10)) * 25;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Rx Wave: Cyan chirp (phase shifted based on HOB distance)
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const delayOffset = (engine.proximityHeight / 25) * 8; // delay depends on HOB
            for (let x = 0; x < w; x++) {
                const t = x / w;
                const y = h / 4 + Math.sin(t * 70 + waveOffset + Math.sin(t * 10) - delayOffset) * 25;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Beat Frequency wave showing difference frequency at bottom
            ctx.strokeStyle = '#ff5a00';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            const beatFreq = 2.0 + (engine.proximityHeight / 25) * 8.0;
            for (let x = 0; x < w; x++) {
                const t = x / w;
                const y = (3 * h / 4) + Math.sin(t * beatFreq * 18 - waveOffset * 1.5) * 25;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Text Labels
            ctx.fillStyle = '#00ff66';
            ctx.font = '9px "JetBrains Mono"';
            ctx.fillText('Tx: 24.15 GHz FMCW Chirp Signal', 10, 20);
            ctx.fillStyle = '#00e5ff';
            ctx.fillText('Rx: Target Proximity Reflective Echo', 10, 32);
            ctx.fillStyle = '#ff5a00';
            ctx.fillText(`Beat Freq (Î”f = ${((engine.proximityHeight / 25) * 8.5).toFixed(1)} MHz)`, 10, h - 10);
        } else if (engine.fuzeMode === 'TIME') {
            // TIME: Digital clock countdown pulse
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const step = 20;
            const digitalOffset = Math.floor(waveOffset * 30) % (step * 2);
            for (let x = 0; x < w; x++) {
                const isHigh = Math.floor((x + digitalOffset) / step) % 2 === 0;
                const y = isHigh ? h / 4 : 3 * h / 4;
                if (x === 0) ctx.moveTo(x, y);
                else {
                    const prevHigh = Math.floor((x - 1 + digitalOffset) / step) % 2 === 0;
                    if (prevHigh !== isHigh) {
                        ctx.lineTo(x, prevHigh ? h / 4 : 3 * h / 4);
                    }
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            ctx.fillStyle = '#00e5ff';
            ctx.font = '9px "JetBrains Mono"';
            ctx.fillText(`Digital Clock Timer (${engine.programmedFlightTime.toFixed(1)}s)`, 10, 20);
        } else {
            // POINT_DETONATION or DELAY: MEMS Accelerometer Shock Pulse
            ctx.strokeStyle = 'rgba(255, 90, 0, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

            ctx.strokeStyle = '#ff5a00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Shift the pulse if DELAY mode
            const tOffset = (engine.fuzeMode === 'DELAY') ? 10 : 2; 

            for (let x = 0; x < w; x++) {
                const t = (x / w) * 20;
                let g = 0;
                if (t > tOffset && t < tOffset + 10) {
                    const tau = 3.5;
                    const dt = t - tOffset;
                    g = 18450 * (dt / tau) * Math.exp(1 - dt / tau);
                }
                const y = (h / 2) - (g / 20000) * (h / 2 - 15);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            ctx.fillStyle = '#ff5a00';
            ctx.font = '9px "JetBrains Mono"';
            const label = engine.fuzeMode === 'DELAY' 
                ? `MEMS Shock Pulse + ${engine.fuzeDelayMs}ms Pyrotechnic Delay` 
                : 'MEMS Accelerometer Peak Shock Pulse (18,450g)';
            ctx.fillText(label, 10, 20);
        }

        fuzeAnimId = requestAnimationFrame(animateFuzeWaveform);
    }
    animateFuzeWaveform();

    if (btnTestDetonation) {
        btnTestDetonation.addEventListener('click', () => {
            playAudioTone(160, 'sawtooth', 0.6);
            const card = btnTestDetonation.parentElement;
            if (card) {
                card.classList.add('fuze-flash');
                setTimeout(() => card.classList.remove('fuze-flash'), 800);
            }
        });
    }

    // 6. Interactive Hardware Nodes Inspector
    const nodeData = {
        '1': {
            title: 'Node 1: FMCW Proximity Radar & Antenna Assembly',
            desc: 'Nose-mounted K-band FMCW radar sensor operating at 24.15 GHz. Provides millimetric altitude resolution down to 10cm for precise airburst proximity detonation above target terrain.',
            specs: 'Shock Rating: 20,000 g axial shock\nOperational Frequency: 24.0 GHz - 24.25 GHz FMCW\nAntenna Type: Microstrip Patch Array Encapsulated in Ceramic Radome'
        },
        '2': {
            title: 'Node 2: 4-Canard Actuation Mechanism & Gearbox',
            desc: 'Spin-decoupled nose assembly housing 4 independent brushless DC micro-servos. Operates cruciform canards up to +/- 15° pitch/yaw deflection to steer trajectory mid-flight.',
            specs: 'Max Deflection Rate: 60° / sec\nActuator Torque: 1.8 Nm per fin\nSpin Decoupling: Precision Dual Ball Bearing Collar (15,000 RPM shell body vs 0 RPM nose)'
        },
        '3': {
            title: 'Node 3: Dual-Antenna Anti-Jam GNSS Receiver',
            desc: 'Multi-constellation (IRNSS/NavIC + GPS L1/L2) receiver equipped with Spatial Nulling CRPA antenna array to resist high-power enemy electronic jamming.',
            specs: 'TTFF (Time to First Fix): < 2.5s post-barrel exit\nAnti-Jamming Margin: > 45 dB J/S resistance\nPositioning Accuracy: 1.2 m RMS'
        },
        '4': {
            title: 'Node 4: MEMS Inertial Measurement Unit (IMU) & EKF PCB',
            desc: 'Hardened 6-axis MEMS gyro and accelerometer sensor suite potted in shock-absorbing polyurethane compound. Runs Extended Kalman Filter for continuous state estimation.',
            specs: 'Gyro Range: +/- 12,000 deg/sec\nAccelerometer Range: +/- 25,000 g axial\nProcess Rate: 1,000 Hz real-time guidance loop'
        },
        '5': {
            title: 'Node 5: High-G Thermal Battery & HV ESAD Capacitor',
            desc: 'Molten-salt thermal battery activated automatically by launch shock impulse (>5,000g). Powers guidance electronics for 120+ seconds and charges ESAD firing capacitor.',
            specs: 'Battery Activation Time: < 150 ms after setback pulse\nVoltage Output: 28 VDC nominal (45 W peak)\nFiring Capacitor: 1,200V High-Energy Deflagration Discharge'
        }
    };

    const nodes = document.querySelectorAll('.component-node');
    const nodeTitle = document.getElementById('node-title');
    const nodeDesc = document.getElementById('node-description');

    nodes.forEach(node => {
        node.addEventListener('click', () => {
            nodes.forEach(n => n.classList.remove('active'));
            node.classList.add('active');

            const id = node.getAttribute('data-node');
            const data = nodeData[id];
            if (data && nodeTitle && nodeDesc) {
                nodeTitle.textContent = data.title;
                nodeDesc.innerHTML = `
                    <p>${data.desc}</p>
                    <div class="formula-card">
                        ${data.specs.replace(/\n/g, '<br>')}
                    </div>
                `;
            }
            playAudioTone(950, 'sine', 0.05);
        });
    });

    // 7. Monte Carlo CEP Target Heatmap
    const canvasCep = document.getElementById('canvas-cep-heatmap');
    const btnRunMonteCarlo = document.getElementById('btn-run-montecarlo');
    const btnReplayMonteCarlo = document.getElementById('btn-replay-montecarlo');
    
    ['wind', 'mv', 'angle', 'gnss'].forEach(k => {
        const input = document.getElementById(`input-unc-${k}`);
        const val = document.getElementById(`val-unc-${k}`);
        if (input && val) {
            input.addEventListener('input', () => {
                let suffix = '';
                if (k === 'wind' || k === 'mv') suffix = ' m/s';
                if (k === 'angle') suffix = '°';
                if (k === 'gnss') suffix = ' m';
                val.textContent = parseFloat(input.value).toFixed(1) + suffix;
            });
        }
    });

    if (btnReplayMonteCarlo) {
        btnReplayMonteCarlo.addEventListener('click', () => {
            if (engine.monteCarloResults && engine.monteCarloResults.job_id) {
                if (typeof window.reRunSimulation === 'function') {
                    window.reRunSimulation(engine.monteCarloResults.job_id, engine.monteCarloResults.resultHash);
                } else {
                    logTerminal('[ERROR] Replay logic missing', 'error');
                }
            } else {
                logTerminal('[MC] No previous run to replay.', 'error');
            }
        });
    }

    // ── P7: getMonteCarloParams ── Shared params builder for Sensitivity & Sweep ──
    function getMonteCarloParams() {
        return {
            target_distance: engine.targetDistance,
            launch_elevation_deg: engine.launchElevationDeg,
            wind_speed_x: engine.windSpeedX,
            wind_speed_z: engine.windSpeedZ,
            latitude_deg: engine.latitudeDeg,
            firing_azimuth_deg: engine.firingAzimuthDeg,
            is_pgk_enabled: engine.isPGKEnabled,
            is_wind_shear_enabled: engine.isWindShearEnabled,
            wind_low_x: engine.windLowX || 0.0,
            wind_med_x: engine.windMedX || 0.0,
            wind_high_x: engine.windHighX || 0.0,
            wind_low_z: engine.windLowZ || 0.0,
            wind_med_z: engine.windMedZ || 0.0,
            wind_high_z: engine.windHighZ || 0.0,
            fuze_mode: engine.fuzeMode || 'PROXIMITY',
            fuze_delay_ms: engine.fuzeDelayMs || 0.0,
            navigation_mode: engine.navigationMode || "NORMAL",
            proximity_height: engine.proximityHeight || 12.0,
            programmed_flight_time: engine.programmedFlightTime || 60.0,
            runs: 100,
            random_seed: Math.floor(Math.random() * 1000000),
            uncertainty: {
                is_active: true,
                wind_uncertainty_mps: parseFloat(document.getElementById('input-unc-wind')?.value || '1.5'),
                muzzle_velocity_uncertainty_mps: parseFloat(document.getElementById('input-unc-mv')?.value || '2.0'),
                angle_uncertainty_deg: parseFloat(document.getElementById('input-unc-angle')?.value || '0.1'),
                gnss_noise_m: parseFloat(document.getElementById('input-unc-gnss')?.value || '4.0'),
                ins_drift_mps: 0.05
            }
        };
    }

    const btnRunSensitivity = document.getElementById('btn-run-sensitivity');
    if (btnRunSensitivity) {
        btnRunSensitivity.addEventListener('click', async () => {
            const statusText = document.getElementById('sensitivity-status');
            const resultsDiv = document.getElementById('sensitivity-results');
            const tbody = document.getElementById('sensitivity-table-body');
            
            btnRunSensitivity.disabled = true;
            statusText.textContent = "Running 5 isolated Monte Carlo iterations...";
            statusText.style.color = "var(--accent-cyan)";
            resultsDiv.style.display = 'none';

            try {
                const params = getMonteCarloParams();
                const res = await fetch('/api/analysis/error_budget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                });
                let rawData = await res.json();
                const data = rawData.data || rawData;
                
                if (data.status === 'success') {
                    btnRunSensitivity.disabled = false;
                    statusText.textContent = "Analysis Complete";
                    statusText.style.color = "var(--accent-emerald)";
                    renderSensitivityTable(data);
                } else {
                    throw new Error("Failed to run error budget");
                }
            } catch (err) {
                btnRunSensitivity.disabled = false;
                statusText.textContent = "Error: " + err.message;
                statusText.style.color = "var(--tactical-red)";
            }
        });
    }

    function renderSensitivityTable(results) {
        document.getElementById('sensitivity-results').style.display = 'block';
        const tbody = document.getElementById('sensitivity-table-body');
        tbody.innerHTML = '';
        
        const baseline = results.base_cep;
        const contributions = results.contributions;
        
        // Calculate max error introduced for the bar chart
        let maxIncrease = 0.1;
        contributions.forEach(r => {
            const inc = Math.max(0, r.effect_m - baseline);
            r.increase = inc;
            if (inc > maxIncrease) maxIncrease = inc;
        });
        
        // Sort by impact
        contributions.sort((a,b) => b.increase - a.increase);
        
        contributions.forEach(r => {
            const pct = (r.increase / maxIncrease) * 100;
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            tr.innerHTML = `
                <td style="padding: 0.75rem 0.5rem; color: var(--text-primary); font-weight: bold;">
                    ${r.source}
                    <div style="font-size: 0.7rem; color: var(--text-dim); font-weight: normal;">${r.scenario}</div>
                </td>
                <td style="padding: 0.75rem 0.5rem; text-align: right;">${r.effect_m.toFixed(2)} m</td>
                <td style="padding: 0.75rem 0.5rem; padding-left: 2rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 100%; background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${pct}%; background: ${pct > 80 ? 'var(--tactical-red)' : (pct > 40 ? 'var(--tactical-amber)' : 'var(--accent-emerald)')}; height: 100%;"></div>
                        </div>
                        <span style="font-size: 0.75rem;">+${r.increase.toFixed(1)}m (${r.relative_pct}%)</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Add baseline row
        const baselineTr = document.createElement('tr');
        baselineTr.innerHTML = `
            <td style="padding: 0.75rem 0.5rem; color: var(--text-dim);">Baseline (No Error)</td>
            <td style="padding: 0.75rem 0.5rem; text-align: right; color: var(--text-dim);">${baseline.toFixed(2)} m</td>
            <td style="padding: 0.75rem 0.5rem; padding-left: 2rem; color: var(--text-dim); font-size: 0.75rem;">
                Theoretical precision floor
            </td>
        `;
        tbody.appendChild(baselineTr);
    }
    
    // Sensitivity Sweep handler
    const btnRunSweep = document.getElementById('btn-run-sweep');
    if (btnRunSweep) {
        btnRunSweep.addEventListener('click', async () => {
            const statusText = document.getElementById('sweep-status');
            const resultsDiv = document.getElementById('sweep-results');
            const tbody = document.getElementById('sweep-table-body');
            const param = document.getElementById('sweep-parameter').value;
            const valuesStr = document.getElementById('sweep-values').value;
            
            const values = valuesStr.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
            if (values.length === 0) {
                statusText.textContent = "Error: Invalid values";
                statusText.style.color = "var(--tactical-red)";
                return;
            }
            
            btnRunSweep.disabled = true;
            statusText.textContent = `Running sweep on ${param} across ${values.length} values...`;
            statusText.style.color = "var(--accent-cyan)";
            resultsDiv.style.display = 'none';

            try {
                const config = getMonteCarloParams();
                const res = await fetch('/api/analysis/sensitivity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config, parameter: param, values, runs: 100 })
                });
                let rawData = await res.json();
                const data = rawData.data || rawData;
                
                if (data.status === 'success') {
                    btnRunSweep.disabled = false;
                    statusText.textContent = "Sweep Complete";
                    statusText.style.color = "var(--accent-emerald)";
                    
                    resultsDiv.style.display = 'block';
                    tbody.innerHTML = '';
                    
                    // find max CEP for scaling
                    let maxCep = 0;
                    data.results.forEach(r => { if(r.cep50 > maxCep) maxCep = r.cep50; });
                    if (maxCep === 0) maxCep = 1;
                    
                    data.results.forEach(r => {
                        const pct = (r.cep50 / maxCep) * 100;
                        const tr = document.createElement('tr');
                        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                        tr.innerHTML = `
                            <td style="padding: 0.75rem 0.5rem; color: var(--text-primary); font-weight: bold;">${r.value.toFixed(2)}</td>
                            <td style="padding: 0.75rem 0.5rem; text-align: right; color: var(--text-secondary);">${r.cep50.toFixed(2)} m</td>
                            <td style="padding: 0.75rem 0.5rem; padding-left: 2rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <div style="width: 100%; background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                                        <div style="width: ${pct}%; background: var(--accent-cyan); height: 100%;"></div>
                                    </div>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                } else {
                    throw new Error("Failed to run sweep");
                }
            } catch (err) {
                btnRunSweep.disabled = false;
                statusText.textContent = "Error: " + err.message;
                statusText.style.color = "var(--tactical-red)";
            }
        });
    }

    function renderMonteCarloCanvas() {
        if (!canvasCep) return;
        const ctx = canvasCep.getContext('2d');
        const w = canvasCep.width = canvasCep.parentElement.clientWidth;
        const h = canvasCep.height = 420;

        ctx.fillStyle = '#06080D';
        ctx.fillRect(0, 0, w, h);

        const centerX = w / 2;
        const centerY = h / 2;

        const results = engine.monteCarloResults;
        
        let maxDist = 200; // minimum zoom to show at least a 200m radius
        if (results && results.unguidedImpacts) {
            results.unguidedImpacts.forEach(pt => {
                maxDist = Math.max(maxDist, Math.abs(pt.x), Math.abs(pt.z));
            });
        }
        
        // Scale to fit maxDist in 90% of the half-width/height
        const scaleX = (w / 2 * 0.85) / maxDist;
        const scaleY = (h / 2 * 0.85) / maxDist;
        const scale = Math.min(scaleX, scaleY);

        // Dynamically select grid rings based on max distance
        let ringRadiiMeters = [2000, 1000, 500, 200, 100, 50];
        if (maxDist > 3000) ringRadiiMeters = [5000, 2500, 1000, 500, 100];
        else if (maxDist < 500) ringRadiiMeters = [400, 200, 100, 50, 20];
        
        // Filter out rings that are too large to fit in canvas
        ringRadiiMeters = ringRadiiMeters.filter(r => r * scale < Math.max(w, h));

        const ringColors = ['rgba(255, 51, 68, 0.05)', 'rgba(255, 179, 0, 0.05)', 'rgba(0, 229, 255, 0.08)', 'rgba(0, 255, 102, 0.1)'];

        ringRadiiMeters.forEach((r, idx) => {
            const pixelRadius = r * scale;
            ctx.fillStyle = ringColors[idx % ringColors.length];
            ctx.beginPath();
            ctx.arc(centerX, centerY, pixelRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, pixelRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Add distance label
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px "JetBrains Mono"';
            ctx.fillText(`${r}m`, centerX + pixelRadius + 2, centerY - 2);
        });

        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX - 12, centerY);
        ctx.lineTo(centerX + 12, centerY);
        ctx.moveTo(centerX, centerY - 12);
        ctx.lineTo(centerX, centerY + 12);
        ctx.stroke();

        if (!results) return;

        const unguidedCepFormatted = typeof results.cepUnguided50 === 'number' ? results.cepUnguided50.toFixed(1) : parseFloat(results.cepUnguided50 || 0).toFixed(1);
        const guidedCepFormatted = typeof results.cepGuided50 === 'number' ? results.cepGuided50.toFixed(1) : parseFloat(results.cepGuided50 || 0).toFixed(1);
        
        document.getElementById('cep-val-unguided').textContent = `${unguidedCepFormatted} m`;
        document.getElementById('cep-val-guided').textContent = `${guidedCepFormatted} m`;
        
        const badge50 = document.getElementById('badge-simulated-50');
        if (badge50) badge50.style.display = 'block';
        const badge90 = document.getElementById('badge-simulated-90');
        if (badge90) badge90.style.display = 'block';

        if (results.metadata) {
            const elRun = document.getElementById('cep-run-id');
            const elModel = document.getElementById('cep-model-version');
            const elConfig = document.getElementById('cep-config-version');
            if (elRun) elRun.textContent = results.metadata.run_id ? results.metadata.run_id.split('-')[0] : "--";
            if (elModel) elModel.textContent = results.metadata.model_version || "--";
            if (elConfig) elConfig.textContent = results.metadata.configuration_version || "--";
        }

        if (results.stats) {
            const elUnguided90 = document.getElementById('cep-val-unguided-90');
            if (elUnguided90) elUnguided90.textContent = results.cepUnguided90 !== undefined ? `${results.cepUnguided90.toFixed(1)} m` : `-- m`;
            
            const elGuided90 = document.getElementById('cep-val-guided-90');
            if (elGuided90) elGuided90.textContent = results.cepGuided90 !== undefined ? `${results.cepGuided90.toFixed(1)} m` : `-- m`;

            const elMean = document.getElementById('cep-mean');
            if (elMean) elMean.textContent = `${(results.meanRadialError || 0).toFixed(1)} m`;
            
            const elMax = document.getElementById('cep-max');
            if (elMax) elMax.textContent = `${(results.maxRadialError || 0).toFixed(1)} m`;
            
            const stdDev = results.stdRadialError || 0;
            const elStdDev = document.getElementById('cep-stddev');
            if (elStdDev) elStdDev.textContent = `${stdDev.toFixed(1)} m`;
            
            const elSeed = document.getElementById('cep-seed-val');
            if (elSeed) elSeed.textContent = results.random_seed || "--";
            
            const elProv = document.getElementById('prov-timestamp');
            if (elProv) elProv.textContent = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z';
            
            if (results.metadata) {
                const elRun = document.getElementById('cep-run-id');
                if (elRun) elRun.textContent = (results.metadata.run_id || "--").substring(0, 8);
                const elModel = document.getElementById('cep-model-version');
                if (elModel) elModel.textContent = results.metadata.physics_version || "--";
                const elConfig = document.getElementById('cep-config-version');
                if (elConfig) elConfig.textContent = (results.metadata.configuration_hash || "--").substring(0,8);
            }
        } else if (results.guidedImpacts && results.guidedImpacts.length > 0) {
            const errs = results.guidedImpacts.map(pt => pt.distErr);
            const minErr = Math.min(...errs);
            const maxErr = Math.max(...errs);
            const meanErr = errs.reduce((a,b) => a+b, 0) / errs.length;
            const variance = errs.reduce((a,b) => a + Math.pow(b - meanErr, 2), 0) / errs.length;
            const stdErr = Math.sqrt(variance);

            const elMean = document.getElementById('cep-mean');
            if (elMean) elMean.textContent = `${meanErr.toFixed(1)} m`;
            
            const elMax = document.getElementById('cep-max');
            if (elMax) elMax.textContent = `${maxErr.toFixed(1)} m`;
            
            const elStdDev = document.getElementById('cep-stddev');
            if (elStdDev) elStdDev.textContent = `${stdErr.toFixed(1)} m`;
            
            const elSeed = document.getElementById('cep-seed-val');
            if (elSeed) elSeed.textContent = "--";
            
            const elProv = document.getElementById('prov-timestamp');
            if (elProv) elProv.textContent = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z';
        }
        if (results && results.unguidedImpacts) {
            results.unguidedImpacts.forEach(pt => {
                const px = centerX + pt.z * scale;
                const py = centerY - pt.x * scale;
                ctx.fillStyle = 'rgba(255, 51, 68, 0.8)';
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        if (results && results.guidedImpacts) {
            results.guidedImpacts.forEach(pt => {
                const px = centerX + pt.z * scale;
                const py = centerY - pt.x * scale;
                ctx.fillStyle = '#00ff66';
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            });
        }

        ctx.fillStyle = 'rgba(255, 51, 68, 0.9)';
        ctx.fillRect(20, 20, 10, 10);
        ctx.fillStyle = '#FFF';
        ctx.font = '11px "JetBrains Mono"';
        ctx.fillText('Unguided 155mm Dispersion', 38, 29);

        ctx.fillStyle = '#00ff66';
        ctx.fillRect(20, 38, 10, 10);
        ctx.fillStyle = '#FFF';
        ctx.fillText('Aegis-155 PGK Clustered', 38, 47);
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`Scale: 1px = ${(1/scale).toFixed(2)}m`, 20, 65);
    }

    function renderPlotly3D(results) {
        if (!results || !results.guidedTrajectories) return;
        
        const data = [];
        
        // Add thin lines for all trajectories
        results.guidedTrajectories.forEach(traj => {
            const x = [], y = [], z = [];
            traj.forEach(pt => {
                x.push(pt[0]);
                y.push(pt[1]);
                z.push(pt[2]);
            });
            data.push({
                x: x, y: y, z: z,
                type: 'scatter3d',
                mode: 'lines',
                line: { width: 2, color: 'rgba(0, 255, 102, 0.18)' },
                showlegend: false,
                hoverinfo: 'none'
            });
        });
        
        // Add final impact points
        const finalX = [], finalY = [], finalZ = [];
        results.guidedImpacts.forEach(pt => {
            finalX.push(pt.absX);
            finalY.push(pt.absY);
            finalZ.push(pt.absZ);
        });
        data.push({
            x: finalX, y: finalY, z: finalZ,
            type: 'scatter3d',
            mode: 'markers',
            marker: { size: 4, color: '#ff3344' },
            name: 'Impact Points'
        });
        
        // Add mean point
        data.push({
            x: [results.stats.mean.x + engine.targetDistance], 
            y: [results.stats.mean.y], 
            z: [results.stats.mean.z],
            type: 'scatter3d',
            mode: 'markers',
            marker: { size: 8, symbol: 'diamond', color: '#00e5ff' },
            name: 'Mean Impact'
        });
        
        const layout = {
            scene: {
                xaxis: { title: 'X (Downrange)' },
                yaxis: { title: 'Y (Altitude)' },
                zaxis: { title: 'Z (Crossrange)' },
                aspectmode: 'manual',
                aspectratio: {x: 2, y: 1, z: 1}
            },
            margin: { l: 0, r: 0, b: 0, t: 10 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#8892b0' },
            showlegend: true,
            legend: { x: 0, y: 1, font: { color: '#fff' } }
        };
        
        if (typeof Plotly !== 'undefined') {
            Plotly.newPlot('plotly-3d-monte-carlo', data, layout, {responsive: true, displayModeBar: false});
        }
    }

    // ── P7: Job tracking for cancel support ────────────────────────────
    let _activeJobId = null;
    let _activeJobCancelled = false;

    // Inject cancel button next to the run button if not present
    const _mcBtnContainer = btnRunMonteCarlo ? btnRunMonteCarlo.parentElement : null;
    let btnCancelMonteCarlo = document.getElementById('btn-cancel-montecarlo');
    if (!btnCancelMonteCarlo && _mcBtnContainer) {
        btnCancelMonteCarlo = document.createElement('button');
        btnCancelMonteCarlo.id = 'btn-cancel-montecarlo';
        btnCancelMonteCarlo.textContent = 'CANCEL';
        btnCancelMonteCarlo.style.cssText = 'display:none;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;padding:0.5rem 1rem;border-radius:6px;cursor:pointer;font-family:var(--font-mono);font-size:0.78rem;font-weight:bold;letter-spacing:0.06em;margin-left:0.5rem;transition:background 0.2s;';
        btnCancelMonteCarlo.addEventListener('mouseenter', () => btnCancelMonteCarlo.style.background = 'rgba(239,68,68,0.3)');
        btnCancelMonteCarlo.addEventListener('mouseleave', () => btnCancelMonteCarlo.style.background = 'rgba(239,68,68,0.15)');
        _mcBtnContainer.appendChild(btnCancelMonteCarlo);
    }

    if (btnCancelMonteCarlo) {
        btnCancelMonteCarlo.addEventListener('click', async () => {
            if (!_activeJobId) return;
            _activeJobCancelled = true;
            try {
                await fetch(`/api/jobs/${_activeJobId}/cancel`, { method: 'POST' });
                logTerminal(`[MC] Cancel signal sent for job ${_activeJobId.substring(0,8)}.`, 'warn');
            } catch (e) {
                logTerminal('[MC] Failed to send cancel signal.', 'error');
            }
        });
    }

    if (btnRunMonteCarlo) {
        btnRunMonteCarlo.addEventListener('click', async () => {
            const countSelect = document.getElementById('monte-carlo-count');
            const count = countSelect ? parseInt(countSelect.value, 10) : 80;
            
            const originalText = btnRunMonteCarlo.textContent;
            btnRunMonteCarlo.disabled = true;
            btnRunMonteCarlo.textContent = 'SUBMITTING...';
            _activeJobId = null;
            _activeJobCancelled = false;
            if (btnCancelMonteCarlo) btnCancelMonteCarlo.style.display = 'none';
            
            try {
                if (engine.monteCarloSeed === null || engine.monteCarloSeed === undefined) {
                    engine.monteCarloSeed = Math.floor(Math.random() * 1000000);
                }

                const payload = {
                    runs: count,
                    random_seed: engine.monteCarloSeed,
                    target_distance: engine.targetDistance,
                    launch_elevation_deg: engine.launchElevationDeg,
                    wind_speed_x: engine.windSpeedX,
                    wind_speed_z: engine.windSpeedZ,
                    latitude_deg: engine.latitudeDeg,
                    firing_azimuth_deg: engine.firingAzimuthDeg,
                    is_pgk_enabled: engine.isPGKEnabled,
                    is_wind_shear_enabled: engine.isWindShearEnabled,
                    wind_low_x: engine.windLowX || 0.0,
                    wind_med_x: engine.windMedX || 0.0,
                    wind_high_x: engine.windHighX || 0.0,
                    wind_low_z: engine.windLowZ || 0.0,
                    wind_med_z: engine.windMedZ || 0.0,
                    wind_high_z: engine.windHighZ || 0.0,
                    fuze_mode: engine.fuzeMode || 'PROXIMITY',
                    fuze_delay_ms: engine.fuzeDelayMs || 0.0,
                    navigation_mode: engine.navigationMode || "NORMAL",
                    proximity_height: engine.proximityHeight || 12.0,
                    programmed_flight_time: engine.programmedFlightTime || 60.0,
                    uncertainty: {
                        is_active: true,
                        wind_uncertainty_mps: parseFloat(document.getElementById('input-unc-wind')?.value || '1.5'),
                        muzzle_velocity_uncertainty_mps: parseFloat(document.getElementById('input-unc-mv')?.value || '2.0'),
                        angle_uncertainty_deg: parseFloat(document.getElementById('input-unc-angle')?.value || '0.1'),
                        gnss_noise_m: parseFloat(document.getElementById('input-unc-gnss')?.value || '4.0'),
                        ins_drift_mps: 0.05
                    }
                };
                
                // Clear seed so next standard run gets a new one (unless replay is clicked)
                engine.monteCarloSeed = null;

                const response = await fetch('/api/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) throw new Error('Monte Carlo job submission failed');
                const data = await response.json();
                const jobId = data.job_id;
                _activeJobId = jobId;
                logTerminal(`[MC] Job ${jobId.substring(0,8)} queued. Polling for completion...`, 'info');
                
                // Show cancel button
                if (btnCancelMonteCarlo) btnCancelMonteCarlo.style.display = 'inline-block';
                
                let jobStatus = 'QUEUED';
                let jobData = null;
                btnRunMonteCarlo.textContent = 'RUNNING (0%)...';
                
                while (jobStatus === 'RUNNING' || jobStatus === 'QUEUED') {
                    await new Promise(r => setTimeout(r, 1000));
                    if (_activeJobCancelled) break; // Client-side break; server cancel already sent
                    const pollRes = await fetch(`/api/jobs/${jobId}`);
                    if (!pollRes.ok) throw new Error('Failed to poll job status');
                    jobData = await pollRes.json();
                    jobStatus = jobData.status;
                    
                    if (jobStatus === 'RUNNING' || jobStatus === 'QUEUED') {
                        const pct = Math.round((jobData.progress || 0) * 100);
                        btnRunMonteCarlo.textContent = `RUNNING (${pct}%)...`;
                    }
                }
                
                if (btnCancelMonteCarlo) btnCancelMonteCarlo.style.display = 'none';
                _activeJobId = null;
                
                // Recheck status after loop exits
                if (_activeJobCancelled) {
                    logTerminal('[MC] Job cancelled by user.', 'warn');
                    throw new Error('Job Cancelled');
                }
                if (!jobData) throw new Error('No poll data received');
                jobStatus = jobData.status;
                
                let finalResults = null;
                if (jobStatus === 'COMPLETED') {
                    const resFinal = await fetch(`/api/jobs/${jobId}/result`);
                    if (!resFinal.ok) throw new Error('Failed to fetch job result');
                    finalResults = await resFinal.json();
                    
                    finalResults.job_id = jobId;
                    
                    logTerminal(`[MC] Job ${jobId.substring(0,8).toUpperCase()} COMPLETE — CEP50: ${(finalResults.cepGuided50 || 0).toFixed(1)} m (${count} rounds).`, 'success');
                } else if (jobStatus === 'CANCELLED') {
                    logTerminal('[MC] Job cancelled by user.', 'warn');
                    throw new Error('Job Cancelled');
                } else {
                    throw new Error(jobData.error_message || 'Simulation failed');
                }
                
                engine.monteCarloResults = finalResults;
                
                btnRunMonteCarlo.textContent = originalText;
                btnRunMonteCarlo.disabled = false;
                
                renderMonteCarloCanvas();
                if (typeof renderPlotly3D === 'function') {
                    renderPlotly3D(engine.monteCarloResults);
                }
                playAudioTone(1050, 'sine', 0.1);
            } catch (e) {
                console.error(e);
                if (e.message !== 'Job Cancelled') {
                    logTerminal(`[ERROR] Monte Carlo failed: ${e.message}`, 'error');
                }
                btnRunMonteCarlo.textContent = originalText;
                btnRunMonteCarlo.disabled = false;
                if (btnCancelMonteCarlo) btnCancelMonteCarlo.style.display = 'none';
                _activeJobId = null;
            }
        });
    }

    // ============================================================
    // 8. 3D WEBGL GRAPHICS MODULE (THREE.JS) — CINEMATIC EDITION
    // ============================================================
    let trigger3DResize = null;
    let updateWebGLFlightVisualizer = null;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SHARED HELPER: Build detailed 155mm PGK Artillery Shell Assembly
    // Modelled after M795 HE projectile with M1156 PGK fuze nose
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function create3DShellModel(isHardwareView) {
        const shellGroup = new THREE.Group();
        const spinningGroup = new THREE.Group();  // main projectile body — spins at 260Hz
        const despunGroup   = new THREE.Group();  // PGK nose kit — counter-spin bearing
        shellGroup.add(spinningGroup);
        shellGroup.add(despunGroup);

        // â”€â”€ Materials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4a5e3d, metalness: 0.45, roughness: 0.62
        }); // Olive Drab projectile body
        const copperMat = new THREE.MeshStandardMaterial({
            color: 0xc97a2a, metalness: 0.92, roughness: 0.08
        }); // Copper driving band
        const tailMat = new THREE.MeshStandardMaterial({
            color: 0x2a3428, metalness: 0.55, roughness: 0.65
        }); // Dark boattail
        const collarMat = new THREE.MeshStandardMaterial({
            color: 0x8aa0ae, metalness: 0.82, roughness: 0.18
        }); // PGK steel collar
        const canardMat = new THREE.MeshStandardMaterial({
            color: 0xe8a020, metalness: 0.7, roughness: 0.15
        }); // Amber canard fins
        const pcbMat = new THREE.MeshStandardMaterial({
            color: 0x1a7a4a, roughness: 0.85, metalness: 0.1
        }); // Green electronics board
        const radomeMat = new THREE.MeshPhysicalMaterial({
            color: 0x00bcd4, transparent: true, opacity: 0.45,
            roughness: 0.12, transmission: 0.65, 
            metalness: 0.0
        }); // FMCW radar radome (translucent nose cone)
        const tailFinMat = new THREE.MeshStandardMaterial({
            color: 0x556849, metalness: 0.5, roughness: 0.55
        }); // Tail stabiliser fins

        // â”€â”€ SPINNING GROUP: Main Projectile Body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Ogive-shaped nose body (upper cylinder + tapered shoulder)
        const body1 = new THREE.CylinderGeometry(0.98, 0.98, 3.2, 32);
        const bodyMesh1 = new THREE.Mesh(body1, bodyMat);
        bodyMesh1.position.y = -0.8;
        spinningGroup.add(bodyMesh1);

        // Lower cylindrical section with slight taper (bourrelet)
        const body2 = new THREE.CylinderGeometry(1.0, 1.0, 2.2, 32);
        const bodyMesh2 = new THREE.Mesh(body2, bodyMat);
        bodyMesh2.position.y = -3.3;
        spinningGroup.add(bodyMesh2);

        // Copper driving band ring (engraved into body)
        const band1 = new THREE.CylinderGeometry(1.035, 1.035, 0.28, 32);
        const bandMesh = new THREE.Mesh(band1, copperMat);
        bandMesh.position.y = -4.1;
        spinningGroup.add(bandMesh);

        // Secondary copper engraving ring
        const band2 = new THREE.CylinderGeometry(1.022, 1.022, 0.14, 32);
        const bandMesh2 = new THREE.Mesh(band2, copperMat);
        bandMesh2.position.y = -4.6;
        spinningGroup.add(bandMesh2);

        // Boattail — tapered rear end (reduces base drag)
        const tailGeom = new THREE.CylinderGeometry(1.0, 0.72, 1.8, 32);
        const tailMesh = new THREE.Mesh(tailGeom, tailMat);
        tailMesh.position.y = -5.8;
        spinningGroup.add(tailMesh);

        // Base disc (flat rear)
        const baseGeom = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 32);
        const baseMesh = new THREE.Mesh(baseGeom, tailMat);
        baseMesh.position.y = -6.74;
        spinningGroup.add(baseMesh);

        // â”€â”€ DESPUN GROUP: PGK Precision Guidance Kit Nose Assembly â”€â”€â”€â”€â”€â”€â”€â”€
        // Cylindrical guidance collar housing canards + electronics
        const collarGeom = new THREE.CylinderGeometry(0.98, 0.98, 1.9, 32);
        const collarMesh = new THREE.Mesh(collarGeom, collarMat);
        collarMesh.position.y = 1.05;
        despunGroup.add(collarMesh);

        // Electronics / PCB stack inside collar
        const pcbGeom = new THREE.CylinderGeometry(0.82, 0.82, 0.18, 32);
        const pcbMesh = new THREE.Mesh(pcbGeom, pcbMat);
        pcbMesh.position.y = 0.95;
        despunGroup.add(pcbMesh);

        // Ogive radome nose cone (realistic FMCW radar dome shape)
        const radomeGeom = new THREE.ConeGeometry(0.98, 4.0, 32, 4, false);
        const radomeMesh = new THREE.Mesh(radomeGeom, radomeMat);
        radomeMesh.position.y = 4.0;
        despunGroup.add(radomeMesh);

        // Nose tip cap (hardened steel)
        const tipGeom = new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const tipMesh = new THREE.Mesh(tipGeom, collarMat);
        tipMesh.position.y = 5.97;
        despunGroup.add(tipMesh);

        // â”€â”€ CANARD FIN ASSEMBLY (4-fin cruciform) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const canardFins = [];
        const finAngleOffsets = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.95, -0.15);
        finShape.lineTo(1.10, -0.05);
        finShape.lineTo(0.80, 0.80);
        finShape.lineTo(0, 0.65);
        finShape.closePath();

        const extrudeSettings = { depth: 0.065, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.02, bevelSegments: 2 };
        const finGeom = new THREE.ExtrudeGeometry(finShape, extrudeSettings);
        finGeom.translate(0, -0.25, -0.032);

        for (let i = 0; i < 4; i++) {
            const pivotGroup = new THREE.Group();
            pivotGroup.position.set(0, 1.1, 0);
            pivotGroup.rotation.y = finAngleOffsets[i];

            const finMesh = new THREE.Mesh(finGeom, canardMat);
            finMesh.position.x = 0.97;
            pivotGroup.add(finMesh);

            despunGroup.add(pivotGroup);
            canardFins.push(pivotGroup);
        }

        // â”€â”€ TAIL FIN ASSEMBLY (4 fixed stabiliser fins) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const tailFinShape = new THREE.Shape();
        tailFinShape.moveTo(0, 0);
        tailFinShape.lineTo(0.6, 0.1);
        tailFinShape.lineTo(0.5, 1.1);
        tailFinShape.lineTo(0, 0.9);
        tailFinShape.closePath();
        const tailExtrudeSettings = { depth: 0.055, bevelEnabled: false };
        const tailFinGeom = new THREE.ExtrudeGeometry(tailFinShape, tailExtrudeSettings);
        tailFinGeom.translate(0, -0.9, -0.028);

        for (let i = 0; i < 4; i++) {
            const tfPivot = new THREE.Group();
            tfPivot.position.set(0, -5.1, 0);
            tfPivot.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const tfMesh = new THREE.Mesh(tailFinGeom, tailFinMat);
            tfMesh.position.x = 0.72;
            tfPivot.add(tfMesh);
            spinningGroup.add(tfPivot);
        }

        return {
            group: shellGroup, spinningGroup, despunGroup,
            bodyMesh: bodyMesh1, bandMesh, tailMesh, collarMesh, radomeMesh, pcbMesh,
            canardFins,
            updateExplode: function(offset) {
                bodyMesh1.position.y  = -0.8 - offset * 2.5;
                bodyMesh2.position.y  = -3.3 - offset * 3.5;
                bandMesh.position.y   = -4.1 - offset * 3.5;
                bandMesh2.position.y  = -4.6 - offset * 3.5;
                tailMesh.position.y   = -5.8 - offset * 5.5;
                baseMesh.position.y   = -6.74 - offset * 5.5;
                collarMesh.position.y = 1.05 + offset * 1.5;
                pcbMesh.position.y    = 0.95 + offset * 3.0;
                radomeMesh.position.y = 4.0 + offset * 7.0;
                tipMesh.position.y    = 5.97 + offset * 7.0;
                canardFins.forEach((fin) => {
                    fin.position.y = 1.1 + offset * 4.5;
                    fin.children[0].position.x = 0.97 + offset * 2.2;
                });
            },
            setXRay: function(isWireframe) {
                const list = [bodyMesh1, bodyMesh2, bandMesh, bandMesh2, tailMesh, baseMesh, collarMesh, pcbMesh];
                list.forEach(mesh => {
                    mesh.material.wireframe = isWireframe;
                    mesh.material.transparent = isWireframe;
                    mesh.material.opacity = isWireframe ? 0.22 : 1.0;
                });
                canardFins.forEach(pivot => {
                    const fin = pivot.children[0];
                    fin.material.wireframe = isWireframe;
                    fin.material.transparent = isWireframe;
                    fin.material.opacity = isWireframe ? 0.35 : 1.0;
                });
            },
            highlightPart: function(partKey) {
                const allMeshes = [bodyMesh1, bodyMesh2, bandMesh, bandMesh2, tailMesh, baseMesh, collarMesh, pcbMesh, radomeMesh, tipMesh];
                
                // Reset all to ghost state
                allMeshes.forEach(m => {
                    m.material.transparent = true;
                    m.material.opacity = 0.1;
                    if (m.material.emissive) m.material.emissive.setHex(0x000000);
                });
                canardFins.forEach(pivot => {
                    const fin = pivot.children[0];
                    fin.material.transparent = true;
                    fin.material.opacity = 0.1;
                    if (fin.material.emissive) fin.material.emissive.setHex(0x000000);
                });

                if (partKey === 'ALL') {
                    allMeshes.forEach(m => {
                        m.material.transparent = false;
                        m.material.opacity = 1.0;
                    });
                    canardFins.forEach(pivot => {
                        pivot.children[0].material.transparent = false;
                        pivot.children[0].material.opacity = 1.0;
                    });
                    radomeMesh.material.transparent = true;
                    radomeMesh.material.opacity = 0.45;
                    return;
                }

                let targets = [];
                if (partKey === 'RADOME') targets = [radomeMesh, pcbMesh, tipMesh];
                else if (partKey === 'CANARDS') targets = canardFins.map(p => p.children[0]);
                else if (partKey === 'GNSS') targets = [collarMesh];
                else if (partKey === 'BATTERY') targets = [pcbMesh];
                else if (partKey === 'COLLAR') targets = [collarMesh, pcbMesh];
                
                targets.forEach(m => {
                    m.material.transparent = false;
                    m.material.opacity = 1.0;
                    if (m.material.emissive) m.material.emissive.setHex(0x113355);
                });
                if (partKey === 'RADOME') {
                    radomeMesh.material.transparent = true;
                    radomeMesh.material.opacity = 0.8;
                }
            }
        };
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 8a. Tab 3: Exploded PGK Assembly Viewport (Hardware Viewer)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function initThreeDViewer() {
        const container = document.getElementById('canvas-3d-container');
        if (!container) return;
        container.innerHTML = '';

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080b14);

        // Subtle fog for depth
        scene.fog = new THREE.FogExp2(0x080b14, 0.025);

        const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 200);
        camera.position.set(4, 4, 16);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.maxDistance = 35;
        controls.minDistance = 4;
        controls.target.set(0, 0, 0);

        // â”€â”€ Cinematic Lighting Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const ambient = new THREE.AmbientLight(0x1a2a40, 0.6);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
        keyLight.position.set(6, 14, 10);
        keyLight.castShadow = true;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x00e5ff, 0.55);
        fillLight.position.set(-8, -3, -6);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xff8c00, 0.3);
        rimLight.position.set(0, -6, 8);
        scene.add(rimLight);

        // Point light glow underneath (reflection effect)
        const groundGlow = new THREE.PointLight(0x00e5ff, 0.4, 18);
        groundGlow.position.set(0, -8, 0);
        scene.add(groundGlow);

        // â”€â”€ Reflective Ground Plane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const groundGeom = new THREE.CircleGeometry(14, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x0a1020, metalness: 0.9, roughness: 0.1
        });
        const groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -8.5;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // â”€â”€ Grid overlay on ground â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const gridHelper = new THREE.GridHelper(20, 20, 0x00e5ff, 0x0d1a2e);
        gridHelper.position.y = -8.4;
        scene.add(gridHelper);

        const shellModel = create3DShellModel(true);
        window.shellModel3D = shellModel;
        scene.add(shellModel.group);

        let isExploded = false, isWireframe = false, isAutoRotating = true;
        let explodeOffset = 0.0, autoRotTime = 0;

        const btnExplode    = document.getElementById('btn-3d-explode');
        const btnWireframe  = document.getElementById('btn-3d-wireframe');
        const btnAutoRotate = document.getElementById('btn-3d-autorotate');
        const btnReset      = document.getElementById('btn-3d-reset');
        const hud3dMode     = document.getElementById('hud-3d-mode');

        if (btnExplode) btnExplode.addEventListener('click', () => {
            isExploded = !isExploded;
            if (hud3dMode) { hud3dMode.textContent = isExploded ? 'EXPLODED ASSEMBLY' : 'ASSEMBLED'; hud3dMode.style.color = isExploded ? 'var(--tactical-amber)' : '#00e5ff'; }
        });
        if (btnWireframe) btnWireframe.addEventListener('click', () => { isWireframe = !isWireframe; shellModel.setXRay(isWireframe); });
        if (btnAutoRotate) btnAutoRotate.addEventListener('click', () => { isAutoRotating = !isAutoRotating; });
        if (btnReset) btnReset.addEventListener('click', () => {
            camera.position.set(4, 4, 16); controls.target.set(0, 0, 0);
            isExploded = false; isWireframe = false; shellModel.setXRay(false);
            if (hud3dMode) { hud3dMode.textContent = 'ASSEMBLED'; hud3dMode.style.color = '#00e5ff'; }
        });

        const input3dPitch = document.getElementById('input-3d-pitch');
        const input3dYaw   = document.getElementById('input-3d-yaw');

        let _last3DTime = 0;
        function animate3D(now) {
            requestAnimationFrame(animate3D);
            if (now && _last3DTime && (now - _last3DTime < 32)) return;
            _last3DTime = now || 0;
            requestAnimationFrame(animate3D);
            autoRotTime += 0.005;

            // Smooth explode lerp
            const targetExplode = isExploded ? 1.0 : 0.0;
            explodeOffset += (targetExplode - explodeOffset) * 0.08;
            shellModel.updateExplode(explodeOffset);

            // Tilt shell slightly for dynamic presentation angle
            shellModel.group.rotation.x = -0.18;

            // Auto-orbit rotate
            if (isAutoRotating) shellModel.group.rotation.y = autoRotTime;

            // Spin body, keep despun nose still
            shellModel.spinningGroup.rotation.y += 0.04;
            shellModel.despunGroup.rotation.y -= 0.005; // slow counter-roll

            // Canard deflection from slider inputs
            const pitchVal = input3dPitch ? parseFloat(input3dPitch.value) : 0;
            const yawVal   = input3dYaw   ? parseFloat(input3dYaw.value)   : 0;
            const pitchRad = (pitchVal * Math.PI) / 180;
            const yawRad   = (yawVal   * Math.PI) / 180;
            shellModel.canardFins[0].children[0].rotation.z =  pitchRad;
            shellModel.canardFins[2].children[0].rotation[0] = -pitchRad;
            shellModel.canardFins[2].children[0].rotation.z = -pitchRad;
            shellModel.canardFins[1].children[0].rotation.z =  yawRad;
            shellModel.canardFins[3].children[0].rotation.z = -yawRad;

            // Pulsing ground glow
            groundGlow.intensity = 0.3 + 0.1 * Math.sin(autoRotTime * 2.5);

            controls.update();
            renderer.render(scene, camera);
        }
        animate3D();

        trigger3DResize = function() {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', trigger3DResize);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 8b. Tab 1: Cinematic Flight Simulator 3D View (Three.js WebGL)
    //     CHASE CAM:    Close-up view tracking spinning shell through atmosphere
    //     OVERVIEW 3D:  Full 24km ballistic arc over realistic terrain landscape
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function initWebGLFlightVisualizer() {
        const container = document.getElementById('canvas-trajectory-3d');
        if (!container || !container.parentElement) return;

        const scene = new THREE.Scene();

        // Use parent dimensions as fallback when container is display:none (clientWidth=0)
        const initW = container.clientWidth || container.parentElement.clientWidth || 800;
        const initH = container.clientHeight || container.parentElement.clientHeight || 500;

        const camera = new THREE.PerspectiveCamera(50, initW / initH, 0.5, 250000);
        camera.position.set(0, 8, 26);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(initW, initH);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.domElement.style.width  = '100%';
        renderer.domElement.style.height = '100%';
        container.innerHTML = '';
        container.appendChild(renderer.domElement);


        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxDistance = 60000;
        controls.minDistance = 3;

        // PHYSICAL DAYLIGHT SKY & LIGHTING
        scene.background = new THREE.Color(0x6b95c2);

        const ambientLight = new THREE.AmbientLight(0x789ac0, 0.6);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfffae6, 1.4);
        sunLight.position.set(12000, 18000, 6000);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width  = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far  = 50000;
        sunLight.shadow.camera.left = -25000;
        sunLight.shadow.camera.right = 25000;
        sunLight.shadow.camera.top  = 25000;
        sunLight.shadow.camera.bottom = -25000;
        scene.add(sunLight);

        const skyFill = new THREE.DirectionalLight(0x4080c0, 0.45);
        skyFill.position.set(-6000, 4000, -5000);
        scene.add(skyFill);

        scene.fog = new THREE.FogExp2(0x84a8cd, 0.000035);

        // ATMOSPHERE DOME (Pure Daylight Gradient, No Stars)
        const tropoGeom = new THREE.SphereGeometry(75000, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const tropoMat  = new THREE.MeshBasicMaterial({
            color: 0x4878a8, transparent: true, opacity: 0.85, side: THREE.BackSide
        });
        const tropoMesh = new THREE.Mesh(tropoGeom, tropoMat);
        tropoMesh.position.y = -1000;
        scene.add(tropoMesh);

        const horizonGeom = new THREE.TorusGeometry(68000, 2200, 8, 64);
        const horizonMat  = new THREE.MeshBasicMaterial({
            color: 0x88c0ee, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending
        });
        const horizonRing = new THREE.Mesh(horizonGeom, horizonMat);
        horizonRing.rotation.x = Math.PI / 2;
        horizonRing.position.y = 400;
        scene.add(horizonRing);

        // BATTLEFIELD LAND TERRAIN
        const groundGeom = new THREE.PlaneGeometry(80000, 60000, 160, 120);
        const groundPos  = groundGeom.attributes.position;

        for (let i = 0; i < groundPos.count; i++) {
            const x = groundPos.getX(i);
            const z = groundPos.getZ(i);
            const distFrac = Math.min(1.0, Math.abs(x) / 35000);
            const height =
                Math.sin(x * 0.0001) * Math.cos(z * 0.00015) * 220 * distFrac +
                Math.sin(x * 0.0003 + 0.8) * Math.sin(z * 0.00025) * 110 * distFrac +
                Math.cos(x * 0.0007 + z * 0.0004) * 45 * distFrac;
            groundPos.setY(i, height);
        }
        groundGeom.computeVertexNormals();

        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x365428, roughness: 0.88, metalness: 0.05
        });
        const groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(35000, -8, 0);
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        // MOUNTAIN PEAKS
        for (let m = 0; m < 22; m++) {
            const mH = 1200 + Math.random() * 2800;
            const mR = 800 + Math.random() * 900;
            const mGeom = new THREE.ConeGeometry(mR, mH, 7 + Math.floor(Math.random() * 5));
            const mMat  = new THREE.MeshStandardMaterial({ color: 0x2e422c, roughness: 0.92 });
            const mMesh = new THREE.Mesh(mGeom, mMat);
            mMesh.position.set(
                15000 + (Math.random() - 0.5) * 45000,
                mH / 2 - 150,
                -12000 - Math.random() * 8000
            );
            mMesh.receiveShadow = true;
            scene.add(mMesh);
        }

        // 155mm HOWITZER GUN BATTERY (Origin X=0, Y=0, Z=0)
        const howitzerGroup = new THREE.Group();
        const steelMat  = new THREE.MeshStandardMaterial({ color: 0x2e3a29, metalness: 0.75, roughness: 0.35 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x161e16, metalness: 0.85, roughness: 0.25 });
        const rubberMat = new THREE.MeshStandardMaterial({ color: 0x101310, roughness: 0.9, metalness: 0.1 });

        const barrelGeom = new THREE.CylinderGeometry(18, 22, 260, 32);
        const barrelMesh = new THREE.Mesh(barrelGeom, steelMat);
        barrelMesh.position.y = 130;

        const brakeGeom = new THREE.CylinderGeometry(30, 28, 55, 32);
        const brakeMesh = new THREE.Mesh(brakeGeom, darkMetal);
        brakeMesh.position.y = 275;

        const cradleGeom = new THREE.BoxGeometry(60, 140, 60);
        const cradleMesh = new THREE.Mesh(cradleGeom, steelMat);
        cradleMesh.position.y = 70;

        const gunPivot = new THREE.Group();
        gunPivot.add(barrelMesh, brakeMesh, cradleMesh);
        gunPivot.position.set(0, 50, 0);
        gunPivot.rotation.z = -(45 * Math.PI / 180);

        const carriageGeom = new THREE.BoxGeometry(110, 45, 130);
        const carriageMesh = new THREE.Mesh(carriageGeom, darkMetal);
        carriageMesh.position.y = 22;

        const tireGeom = new THREE.CylinderGeometry(48, 48, 28, 32);
        tireGeom.rotateZ(Math.PI / 2);
        const tireL = new THREE.Mesh(tireGeom, rubberMat);
        tireL.position.set(-75, 30, 0);
        const tireR = new THREE.Mesh(tireGeom, rubberMat);
        tireR.position.set(75, 30, 0);

        howitzerGroup.add(carriageMesh, tireL, tireR, gunPivot);
        howitzerGroup.position.set(0, 0, 0);
        scene.add(howitzerGroup);

        // TARGET BUNKER & CROSSHAIR ZONE
        const bunkerGeom = new THREE.BoxGeometry(300, 120, 300);
        const bunkerMat  = new THREE.MeshStandardMaterial({ color: 0x484e54, roughness: 0.95 });
        const bunkerMesh = new THREE.Mesh(bunkerGeom, bunkerMat);
        bunkerMesh.position.set(engine.targetDistance, 50, 0);
        bunkerMesh.receiveShadow = true;
        scene.add(bunkerMesh);

        const tgt1Geom = new THREE.RingGeometry(180, 240, 64);
        const tgt1Mat  = new THREE.MeshBasicMaterial({
            color: 0xff2233, side: THREE.DoubleSide, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending
        });
        const targetRing1 = new THREE.Mesh(tgt1Geom, tgt1Mat);
        targetRing1.rotation.x = -Math.PI / 2;

        const tgt2Geom = new THREE.RingGeometry(40, 60, 64);
        const tgt2Mat  = new THREE.MeshBasicMaterial({
            color: 0xff6644, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
        });
        const targetRing2 = new THREE.Mesh(tgt2Geom, tgt2Mat);
        targetRing2.rotation.x = -Math.PI / 2;

        const tgtDotGeom = new THREE.CircleGeometry(12, 32);
        const tgtDotMat  = new THREE.MeshBasicMaterial({ color: 0xff3344, side: THREE.DoubleSide });
        const targetDot  = new THREE.Mesh(tgtDotGeom, tgtDotMat);
        targetDot.rotation.x = -Math.PI / 2;

        const crossMat = new THREE.LineBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.8 });
        const crossGeomH = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-450, 0, 0), new THREE.Vector3(450, 0, 0)]);
        const crossGeomV = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -450), new THREE.Vector3(0, 0, 450)]);
        const crossH = new THREE.Line(crossGeomH, crossMat);
        const crossV = new THREE.Line(crossGeomV, crossMat);
        
        const targetGroup = new THREE.Group();
        targetGroup.add(crossH, crossV, targetRing1, targetRing2, targetDot);
        targetGroup.position.set(engine.targetDistance, 2, 0);
        scene.add(targetGroup);

        // 155mm PROJECTILE IN FLIGHT
        const shellModel = create3DShellModel(false);
        scene.add(shellModel.group);

        const shellModel2 = create3DShellModel(false);
        shellModel2.group.visible = false;
        shellModel2.group.scale.set(120, 120, 120);
        scene.add(shellModel2.group);

        const waveGeom = new THREE.ConeGeometry(2.5, 6.0, 16, 1, true);
        const waveMat  = new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 0.25,
            wireframe: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        });
        const waveMesh = new THREE.Mesh(waveGeom, waveMat);
        waveMesh.rotation.x = Math.PI / 2;
        waveMesh.position.z = 2.8;
        shellModel.despunGroup.add(waveMesh);

        const waveWireGeom = new THREE.ConeGeometry(2.5, 6.0, 16, 1, true);
        const waveWireMat  = new THREE.MeshBasicMaterial({
            color: 0xffcc00, transparent: true, opacity: 0.4,
            wireframe: true, blending: THREE.AdditiveBlending
        });
        const waveWireMesh = new THREE.Mesh(waveWireGeom, waveWireMat);
        waveWireMesh.rotation.x = Math.PI / 2;
        waveWireMesh.position.z = 2.8;
        shellModel.despunGroup.add(waveWireMesh);

        const trailCount = 100;
        const trailGeom  = new THREE.BufferGeometry();
        const trailPos   = new Float32Array(trailCount * 3);
        for (let i = 0; i < trailCount; i++) {
            trailPos[i*3] = 0; trailPos[i*3+1] = 0; trailPos[i*3+2] = 0;
        }
        trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
        const trailMat = new THREE.PointsMaterial({
            color: 0xff8800, size: 0.8, transparent: true, opacity: 0.75,
            blending: THREE.AdditiveBlending, sizeAttenuation: true
        });
        const trailPoints = new THREE.Points(trailGeom, trailMat);
        scene.add(trailPoints);

        const trailWorldPos = Array.from({ length: trailCount }, () => new THREE.Vector3());
        let trailWriteIdx = 0;

        const streakCount = 90;
        const streakGeom  = new THREE.BufferGeometry();
        const streakPos   = new Float32Array(streakCount * 3);
        const streakVels  = [];
        for (let i = 0; i < streakCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 1.5 + Math.random() * 2.5;
            streakPos[i*3]   = Math.cos(angle) * radius;
            streakPos[i*3+1] = Math.sin(angle) * radius;
            streakPos[i*3+2] = (Math.random() - 0.5) * 35;
            streakVels.push(4 + Math.random() * 6);
        }
        streakGeom.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
        const streakMat = new THREE.PointsMaterial({
            color: 0x99ddff, size: 0.12, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, sizeAttenuation: true
        });
        const streakParticles = new THREE.Points(streakGeom, streakMat);
        scene.add(streakParticles);
        streakParticles.visible = false;

        const pathMaterial = new THREE.LineBasicMaterial({
            color: 0x00e5ff, linewidth: 3, transparent: true, opacity: 0.9
        });
        let pathLine = null;
        let pathLine2 = null;

        const cloudCount = 45;
        for (let c = 0; c < cloudCount; c++) {
            const cGeom = new THREE.SphereGeometry(600 + Math.random() * 900, 10, 6);
            const cMat  = new THREE.MeshBasicMaterial({
                color: 0xcee2f5, transparent: true, opacity: 0.22 + Math.random() * 0.15,
                blending: THREE.NormalBlending
            });
            const cMesh = new THREE.Mesh(cGeom, cMat);
            cMesh.position.set(
                4000 + Math.random() * 24000,
                2200 + Math.random() * 1800,
                (Math.random() - 0.5) * 8000
            );
            cMesh.scale.y = 0.35;
            scene.add(cMesh);
        }

        let flightAnimTime = 0;
        let impactFlashAlpha = 0;
        let impactFlashPos = null;
        let prevDetonated = false;

        updateWebGLFlightVisualizer = function() {
            const s = engine.state;
            if (!s) return;

            flightAnimTime += 0.016;

            const newW = renderer.domElement.offsetWidth || container.offsetWidth || 800;
            const newH = renderer.domElement.offsetHeight || container.offsetHeight || 500;
            if (renderer.domElement.width !== newW || renderer.domElement.height !== newH) {
                if (newW > 0 && newH > 0) {
                    camera.aspect = newW / newH;
                    camera.updateProjectionMatrix();
                    renderer.setSize(newW, newH);
                }
            }

            if (gunPivot && engine) {
                gunPivot.rotation.z = -(engine.launchElevationDeg * Math.PI / 180);
            }

            targetGroup.position.set(engine.targetDistance, 2, 0);
            bunkerMesh.position.set(engine.targetDistance, 50, 0);

            const tgtPulse = 0.85 + 0.15 * Math.sin(flightAnimTime * 3.5);
            targetRing1.material.opacity = 0.6 * tgtPulse;
            targetRing2.material.opacity = 0.95 * tgtPulse;

            if (s.detonated && !prevDetonated) {
                impactFlashAlpha = 1.0;
                impactFlashPos = new THREE.Vector3(s.x, Math.max(0, s.y), s.z);

                const dirtGeom = new THREE.BufferGeometry();
                const dirtCount = 180;
                const dirtPos = new Float32Array(dirtCount * 3);
                const dirtVel = [];
                for (let i = 0; i < dirtCount; i++) {
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI * 0.45;
                    const speed = 200 + Math.random() * 450;
                    dirtPos[i*3]   = s.x;
                    dirtPos[i*3+1] = Math.max(0, s.y);
                    dirtPos[i*3+2] = s.z;
                    dirtVel.push({
                        vx: Math.cos(theta) * Math.sin(phi) * speed,
                        vy: Math.cos(phi) * speed,
                        vz: Math.sin(theta) * Math.sin(phi) * speed
                    });
                }
                dirtGeom.setAttribute('position', new THREE.BufferAttribute(dirtPos, 3));
                const dirtMat = new THREE.PointsMaterial({
                    color: 0x5a422b, size: 70, transparent: true, opacity: 0.9, sizeAttenuation: true
                });
                const dirtPoints = new THREE.Points(dirtGeom, dirtMat);
                dirtPoints.name = 'dirt_plume';
                dirtPoints.userData = { vel: dirtVel, age: 0 };
                scene.add(dirtPoints);
            }
            prevDetonated = s.detonated;

            if (viewMode === 'CHASE') {
                controls.enabled = false;
                streakParticles.visible = true;
                if (pathLine) pathLine.visible = true;

                shellModel.group.scale.set(120, 120, 120);
                shellModel.group.position.set(s.x, s.y, s.z);

                const pitchRad = -(s.pitch * Math.PI) / 180;
                shellModel.group.rotation.x = 0;
                shellModel.group.rotation.y = 0;
                shellModel.group.rotation.z = pitchRad;

                scene.rotation.set(0, 0, 0);

                shellModel.spinningGroup.rotation.y += s.spinRateHz * 0.006;
                shellModel.despunGroup.rotation.y   -= s.spinRateHz * 0.001;

                const pr = (s.canardPitchDeg * Math.PI) / 180;
                const yr = (s.canardYawDeg   * Math.PI) / 180;
                shellModel.canardFins[0].children[0].rotation.z =  pr;
                shellModel.canardFins[2].children[0].rotation.z = -pr;
                shellModel.canardFins[1].children[0].rotation.z =  yr;
                shellModel.canardFins[3].children[0].rotation.z = -yr;

                const mach = s.speed / 340;
                if (mach > 1.0) {
                    waveMesh.visible = true;
                    waveWireMesh.visible = true;
                    const waveAlpha = Math.min(0.35, (mach - 1.0) * 0.22);
                    waveMat.opacity = waveAlpha + 0.05 * Math.sin(flightAnimTime * 50);
                    waveWireMat.opacity = waveAlpha * 1.5;
                } else {
                    waveMesh.visible = false;
                    waveWireMesh.visible = false;
                }

                const chaseAngle = 0.5 * Math.sin(flightAnimTime * 0.9);
                camera.position.set(s.x - 40, s.y + 10, s.z + chaseAngle);
                camera.lookAt(s.x, s.y, s.z);

                const altNorm = Math.min(1.0, s.y / 12000);
                renderer.setClearColor(new THREE.Color().lerpColors(
                    new THREE.Color(0x6b95c2),
                    new THREE.Color(0x1a365d),
                    altNorm
                ), 1.0);

                const spArr = streakGeom.attributes.position.array;
                const speedFactor = Math.min(3.5, s.speed / 280);
                for (let i = 0; i < streakCount; i++) {
                    spArr[i*3 + 2] -= streakVels[i] * speedFactor * 0.14;
                    if (spArr[i*3 + 2] < -18) {
                        const angle = Math.random() * Math.PI * 2;
                        const r = 1.2 + Math.random() * 2.5;
                        spArr[i*3]   = Math.cos(angle) * r;
                        spArr[i*3+1] = Math.sin(angle) * r;
                        spArr[i*3 + 2] = 16 + Math.random() * 5;
                    }
                }
                streakGeom.attributes.position.needsUpdate = true;
                streakMat.opacity = 0.35 + speedFactor * 0.25;
                streakMat.color.lerpColors(
                    new THREE.Color(0x88ccff),
                    new THREE.Color(0xffa033),
                    Math.max(0, mach - 1.5) * 0.5
                );

                // Keep terrain visible for realistic chase view
                groundMesh.visible = true;
                tropoMesh.visible  = true;

                // Sky color based on altitude
                const skyColor = new THREE.Color().lerpColors(
                    new THREE.Color(0x0a1e3c),  // troposphere blue
                    new THREE.Color(0x000205),  // stratosphere near black
                    altNorm
                );
                renderer.setClearColor(skyColor, 1.0);

                // Horizon glow — only visible near apex of flight
                horizonRing.visible = altNorm > 0.5;
                horizonRing.material.opacity = (altNorm - 0.5) * 0.6;

                // Starfield — appears above stratosphere line (~8km)
                // starField disabled
                

            } else if (viewMode === '3D') {
                // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
                // 3D OVERVIEW MODE — Full trajectory arc
                // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
                scene.rotation.set(0, 0, 0);

                scene.fog = null;
                renderer.setClearColor(0x6b95c2, 1.0);

                controls.enabled = true;
                streakParticles.visible = false;
                waveMesh.visible = false;
                waveWireMesh.visible = false;
                horizonRing.visible = true;
                // starField disabled
                
                groundMesh.visible = true;
                tropoMesh.visible  = true;

                // Shell follows physics coordinates
                shellModel.group.scale.set(120, 120, 120);
                shellModel.group.position.set(s.x, s.y, s.z);
                // Tilt shell to match pitch vector
                const pitchRad3D = -(s.pitch * Math.PI) / 180;
                shellModel.group.rotation.z = pitchRad3D;

                // Slow visual spin for appeal
                shellModel.spinningGroup.rotation.y += 0.06;

                // Draw trajectory ribbon from history
                if (engine.history && engine.history.length > 1) {
                    if (pathLine) {
                        scene.remove(pathLine);
                        if (pathLine.geometry) pathLine.geometry.dispose();
                        pathLine = null;
                    }
                    const points = engine.history.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));
                    const pathGeom = new THREE.BufferGeometry().setFromPoints(points);
                    pathLine = new THREE.Line(pathGeom, pathMaterial);
                    scene.add(pathLine);
                }

                // Render Unguided comparison trajectory and 3D shell model in 3D overview mode
                if (isComparisonMode && engine2 && engine2.history && engine2.history.length > 1) {
                    if (pathLine2) {
                        scene.remove(pathLine2);
                        if (pathLine2.geometry) pathLine2.geometry.dispose();
                        if (pathLine2.material) pathLine2.material.dispose();
                        pathLine2 = null;
                    }
                    const points2 = engine2.history.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));
                    const pathGeom2 = new THREE.BufferGeometry().setFromPoints(points2);
                    const pathMat2 = new THREE.LineBasicMaterial({ color: 0xff7800, linewidth: 3, transparent: true, opacity: 0.9 });
                    pathLine2 = new THREE.Line(pathGeom2, pathMat2);
                    scene.add(pathLine2);

                    if (shellModel2 && engine2.state) {
                        shellModel2.group.visible = true;
                        shellModel2.group.scale.set(120, 120, 120);
                        shellModel2.group.position.set(engine2.state.x, engine2.state.y, engine2.state.z);
                        shellModel2.group.rotation.z = -(engine2.state.pitch * Math.PI) / 180;
                        shellModel2.spinningGroup.rotation.y += 0.06;
                    }
                } else {
                    if (pathLine2) {
                        scene.remove(pathLine2);
                        if (pathLine2.geometry) pathLine2.geometry.dispose();
                        if (pathLine2.material) pathLine2.material.dispose();
                        pathLine2 = null;
                    }
                    if (shellModel2) shellModel2.group.visible = false;
                }

                // Auto-follow camera in 3D mode
                if (isSimulating && s.x > 0) {
                    const cX = s.x - 3000;
                    const cY = s.y + 2000;
                    camera.position.lerp(new THREE.Vector3(cX, Math.max(cY, 1000), 5000), 0.03);
                    controls.target.lerp(new THREE.Vector3(s.x, s.y, s.z), 0.05);
                }

                controls.update();
            }

            // â”€â”€ Record trail positions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (isSimulating && !s.detonated) {
                trailWorldPos[trailWriteIdx % trailCount].set(s.x, s.y, s.z);
                trailWriteIdx++;

                // Update trail geometry
                const tPos = trailGeom.attributes.position.array;
                for (let i = 0; i < trailCount; i++) {
                    const w = trailWorldPos[i];
                    tPos[i*3]   = w.x - shellModel.group.position.x;
                    tPos[i*3+1] = w.y - shellModel.group.position.y;
                    tPos[i*3+2] = w.z - shellModel.group.position.z;
                }
                trailGeom.attributes.position.needsUpdate = true;
            }

            // ── Land Impact Explosion & Dirt Plume Animation ─────────────────
            if (impactFlashAlpha > 0) {
                impactFlashAlpha -= 0.015;
                const flashSphere = scene.getObjectByName('impact_flash');
                if (flashSphere) {
                    flashSphere.material.opacity = Math.max(0, impactFlashAlpha);
                    flashSphere.scale.setScalar(1 + (1 - impactFlashAlpha) * 8);
                    if (impactFlashAlpha <= 0) scene.remove(flashSphere);
                } else if (impactFlashPos) {
                    const flashGeom = new THREE.SphereGeometry(80, 16, 8);
                    const flashMat  = new THREE.MeshBasicMaterial({
                        color: 0xff5a00, transparent: true, opacity: 1.0,
                        blending: THREE.AdditiveBlending
                    });
                    const flObj = new THREE.Mesh(flashGeom, flashMat);
                    flObj.name = 'impact_flash';
                    flObj.position.copy(impactFlashPos);
                    scene.add(flObj);
                }

                // Animate rising & expanding dirt plume
                const dirtPoints = scene.getObjectByName('dirt_plume');
                if (dirtPoints) {
                    dirtPoints.userData.age += 0.016;
                    const pos = dirtPoints.geometry.attributes.position.array;
                    const vels = dirtPoints.userData.vel;
                    for (let i = 0; i < vels.length; i++) {
                        pos[i*3]   += vels[i].vx * 0.016;
                        pos[i*3+1] += vels[i].vy * 0.016;
                        pos[i*3+2] += vels[i].vz * 0.016;
                        vels[i].vy -= 120 * 0.016; // gravity pulling dirt particles down
                    }
                    dirtPoints.geometry.attributes.position.needsUpdate = true;
                    dirtPoints.material.opacity = Math.max(0, impactFlashAlpha * 0.9);
                    if (impactFlashAlpha <= 0) scene.remove(dirtPoints);
                }
            }

            renderer.render(scene, camera);
        };
    }

    // Spawn viewers after DOM is ready
    setTimeout(() => {
        initThreeDViewer();
        initWebGLFlightVisualizer();
        if (typeof AegisCesiumGlobe !== 'undefined' && document.getElementById('cesium-container')) {
            window.aegisCesium = new AegisCesiumGlobe('cesium-container');
        }
        
        // ═══════════════════════════════════════════════════════════
        // GSAP CINEMATIC CIC BOOT-UP SEQUENCE
        // Simulates a weapons system console powering on
        // ═══════════════════════════════════════════════════════════
        if (typeof gsap !== 'undefined') {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            // Phase 1: Header drops in from top like a CIC rack powering on
            tl.from('header', { 
                y: -80, opacity: 0, duration: 0.8,
                onComplete: () => {
                    // Trigger the header stripe animation visibility
                    document.querySelector('header').style.willChange = 'auto';
                }
            });

            // Phase 2: Badges flash in with a scale pop
            tl.from('.badge-sih, .badge-cep-target', {
                scale: 0, opacity: 0, duration: 0.4, stagger: 0.1,
                ease: 'back.out(2.5)'
            }, '-=0.3');

            // Phase 3: Tab buttons slide in from right, staggered
            // tab-btn animation removed to prevent opacity bugs

            // Phase 4: Status indicators blink on
            tl.from('.status-pill, .status-pill-btn', {
                opacity: 0, scale: 0.8, duration: 0.3, stagger: 0.1,
                ease: 'power2.out'
            }, '-=0.15');

            // Phase 5: Panel cards rack-mount in from alternating sides
            tl.from('.tab-content.active .panel-card', {
                y: 50, opacity: 0, duration: 0.6, stagger: {
                    each: 0.12,
                    from: 'start'
                },
                ease: 'power3.out'
            }, '-=0.1');

            // Phase 6: Telemetry cards cascade in with scale
            tl.from('.telemetry-card', {
                scale: 0.85, opacity: 0, y: 15, duration: 0.35, stagger: 0.04,
                ease: 'power2.out'
            }, '-=0.3');

            // Phase 7: Control sliders and toggles fade in
            tl.from('.control-group, .toggle-switch', {
                x: -20, opacity: 0, duration: 0.3, stagger: 0.03,
                ease: 'power2.out'
            }, '-=0.4');


        }



    }, 250);
});

// toggle logic removed

