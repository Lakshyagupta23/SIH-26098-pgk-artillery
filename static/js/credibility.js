/**
 * AEGIS-155: SIH Phase 24 Model Credibility
 * Renders the dedicated Model Credibility cards to explicitly state
 * validation boundaries for judges.
 */

const CREDIBILITY_MODELS = [
    {
        id: 'flight-dynamics',
        modelName: 'Flight Dynamics Engine (3DOF / Pseudo-6DOF)',
        purpose: 'Simulate the ballistic trajectory of a 155mm M795 equivalent shell from launch to impact, integrating standard meteorological and aerodynamic forces.',
        inputs: 'Launch Elevation, Muzzle Velocity, Wind Vectors (X, Z), Gravity, Air Density (Altitude-dependent).',
        outputs: 'Time-series telemetry: Position (X, Y, Z), Velocity vectors, Spin Rate (estimated).',
        assumptions: 'Point-mass 3DOF trajectory with standard NATO 1976 atmosphere. Magnus forces and full rigid-body nutation/precession are approximated but not fully resolved in 6DOF.',
        status: 'Software-in-the-Loop',
        statusClass: 'cred-status-sil',
        limitations: 'Does not fully model non-linear transonic drag anomalies or detailed base-bleed variants.',
        evidence: 'See Flight Simulator tab (Baseline vs Guided).'
    },
    {
        id: 'navigation-filter',
        modelName: 'Navigation Filter (GNSS/INS EKF)',
        purpose: 'Estimate the true state of the projectile (Position, Velocity) by fusing noisy GNSS and IMU data using an Extended Kalman Filter.',
        inputs: 'Simulated GNSS fixes (10Hz, Gaussian noise), Simulated IMU accelerometer/gyro data (1kHz, drift + bias).',
        outputs: 'Estimated Position, Estimated Velocity, Filter Covariance.',
        assumptions: 'Gaussian noise models. IMU biases are modeled as random walks.',
        status: 'Software-in-the-Loop',
        statusClass: 'cred-status-sil',
        limitations: 'Physical high-G shock impact on MEMS sensor bias drift is modeled mathematically, not empirically derived from live-fire data. No physical hardware-in-the-loop test has been performed.',
        evidence: 'See Telemetry Dashboard (GNSS/EKF state indicators).'
    },
    {
        id: 'canard-actuation',
        modelName: 'Canard Aerodynamic Steering',
        purpose: 'Convert guidance law commands into physical lift forces to steer the projectile.',
        inputs: 'Desired lateral acceleration, Current Airspeed, Altitude.',
        outputs: 'Canard deflection angles, Applied lateral aerodynamic force.',
        assumptions: 'Actuator response is modeled as a 1st-order lag (tau=0.05s). Lift coefficient is linearly proportional to deflection angle within stall limits.',
        status: 'Mathematical Model',
        statusClass: 'cred-status-math',
        limitations: 'Wind-tunnel validation of the specific canard foil shape has not been performed. Stagnation pressure at Mach 2.5 is theoretically calculated.',
        evidence: 'See Simulator (PGK Active trajectory deviation).'
    },
    {
        id: 'esad-fuze',
        modelName: 'ESAD & Fuze Logic State Machine',
        purpose: 'Ensure the munition remains inert until safe separation (Setback + Spin) and triggers detonation at the precise target criteria.',
        inputs: 'Setback acceleration (>10,000g), Spin rate (>20Hz), Flight Time, Radar Altimeter (Proximity).',
        outputs: 'Arming State, Detonation Trigger Signal.',
        assumptions: 'Sensors report accurately. The state machine operates in real-time without RTOS preemption lag.',
        status: 'Software-in-the-Loop (State Machine)',
        statusClass: 'cred-status-sil',
        limitations: 'State-machine behavior is verified in software simulation using injected trigger parameters. No physical MCU integration with live setback or spin signals has been performed. Physical HIL validation is a future milestone.',
        evidence: 'See Electronic Fuze Console.'
    },
    {
        id: 'monte-carlo',
        modelName: 'Monte Carlo Statistical Framework',
        purpose: 'Statistically quantify the Circular Error Probable (CEP) by running thousands of dispersed simulations.',
        inputs: 'Standard deviations for Muzzle Velocity, Elevation Angle, Wind, and GNSS accuracy.',
        outputs: 'Scatter plot of impact points, CEP50, CEP90.',
        assumptions: 'Error sources are normally distributed and independent.',
        status: 'Software-in-the-Loop',
        statusClass: 'cred-status-sil',
        limitations: 'Only samples the modeled parameter space; unknown unknowns in live fire are not captured.',
        evidence: 'See Monte Carlo CEP tab.'
    },
    {
        id: 'hardware-swapc',
        modelName: 'Hardware SWaP-C & Survivability',
        purpose: 'Determine the Size, Weight, Power, and Cost feasibility of retrofitting standard 155mm shells.',
        inputs: 'COTS component datasheets, volume constraints of the NATO 2-inch fuze well.',
        outputs: 'Power Budget, Mass Estimate, Preliminary BOM Cost.',
        assumptions: 'Standard commercial electronic components can survive 18,450g setback forces via epoxy potting (based on industry literature).',
        status: 'Not Validated',
        statusClass: 'cred-status-none',
        limitations: 'No air-gun setback shock testing or spin testing (>200Hz) has been physically performed on the assembled prototype.',
        evidence: 'See BOM & SWaP-C tab.'
    }
];

export function renderCredibilityCards() {
    const grid = document.getElementById('credibility-grid');
    if (!grid) return;

    let html = '';

    CREDIBILITY_MODELS.forEach(model => {
        html += `
            <div class="cred-card">
                <div class="cred-card-header">
                    <div class="cred-card-title">${model.modelName}</div>
                    <div class="cred-status-badge ${model.statusClass}">${model.status}</div>
                </div>
                <div class="cred-card-body">
                    <div class="cred-row">
                        <div class="cred-label">Purpose</div>
                        <div class="cred-value highlight">${model.purpose}</div>
                    </div>
                    <div class="cred-row">
                        <div class="cred-label">Inputs</div>
                        <div class="cred-value">${model.inputs}</div>
                    </div>
                    <div class="cred-row">
                        <div class="cred-label">Outputs</div>
                        <div class="cred-value">${model.outputs}</div>
                    </div>
                    <div class="cred-row">
                        <div class="cred-label">Assumptions</div>
                        <div class="cred-value">${model.assumptions}</div>
                    </div>
                    <div class="cred-row">
                        <div class="cred-label">Limitations</div>
                        <div class="cred-value" style="color: #ef4444;">${model.limitations}</div>
                    </div>
                    <div class="cred-row">
                        <div class="cred-label">Evidence</div>
                        <div class="cred-value" style="color: #3b82f6;">${model.evidence}</div>
                    </div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}
