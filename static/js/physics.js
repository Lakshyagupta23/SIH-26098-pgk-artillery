/**
 * Aegis-155 Ballistics & Canard Actuation Config Container
 * SIH Problem Statement ID: 26098
 * 
 * NOTE: This file now acts purely as a configuration/state container for the UI.
 * SOURCE OF TRUTH: All actual computational physics, aerodynamics, Monte Carlo 
 * logic, and EKF filtering have been moved to `physics.py` on the backend.
 * Do not add mathematical logic here to avoid UI/Backend drift.
 */

class BallisticsEngine {
    constructor() {
        // Physical Constants (for reference)
        this.g0 = 9.80665;             // m/s^2 standard gravity
        this.rho0 = 1.225;             // kg/m^3 sea level air density
        this.R_air = 287.05;           // J/(kg*K) specific gas constant
        this.gamma = 1.4;              // adiabatic index

        // 155mm Shell Parameters (Standard ATAGS / Dhanush / NATO M107 standard)
        this.caliber = 0.155;          // meters (155 mm)
        this.area = Math.PI * Math.pow(this.caliber / 2, 2); // 0.01887 m^2 reference area
        this.mass = 43.5;              // kg
        this.muzzleVelocity = 827;     // m/s (Charge 8 Super / 52 cal)
        this.standardCd = 0.22;        // baseline supersonic drag coefficient

        // Default Environment & Coriolis Settings
        this.windSpeedX = 5.0;         // m/s constant headwind
        this.windSpeedZ = 3.0;         // m/s constant crosswind
        this.isWindShearEnabled = false;
        
        // Coriolis parameters
        this.latitudeDeg = 21.5;       // Latitude (degrees, typical Pokhran Field Firing Range)
        this.firingAzimuthDeg = 45.0;  // Firing azimuth direction relative to True North (degrees)
        this.omegaEarth = 7.292115e-5; // rad/s Earth rotation rate
        
        // Wind Shear layers (Low: 0-4km, Med: 4-8km, High: 8km+)
        this.windLowX = 3.0;
        this.windLowZ = 2.0;
        this.windMedX = 8.0;
        this.windMedZ = 5.0;
        this.windHighX = 15.0;
        this.windHighZ = 10.0;

        this.targetDistance = 24000;   // meters (24 km)
        this.targetAltitude = 120;     // meters elevation
        this.launchElevationDeg = 48.5;// degrees angle of fire

        // PGK Settings
        this.isPGKEnabled = true;
        this.isGNSSJammed = false;
        this.canardMaxDeflection = 15; // degrees max deflection
        this.navGain = 4.0;            // Proportional Navigation Constant N'
        
        // Fuze Settings
        this.fuzeMode = 'PROXIMITY';   // 'POINT_DETONATION', 'DELAY', 'PROXIMITY', 'TIME'
        this.proximityHeight = 12.0;   // meters Height of Burst (HoB)
        this.fuzeDelayMs = 25;         // ms delay after impact for bunkered targets
        this.programmedFlightTime = 60.0; // seconds for TIME mode

        // Flight Telemetry State
        this.state = null;
        this.history = [];
        this.monteCarloResults = null;
    }

    // Initialize single shot flight state (UI reset only)
    initFlight(customAngle = null, customWindX = null, customWindZ = null, customPgk = null) {
        const angle = customAngle !== null ? customAngle : this.launchElevationDeg;
        const elevationRad = (angle * Math.PI) / 180;
        
        // Assume muzzle velocity is standard for UI initial state (recalculated correctly on backend)
        const v0 = 827;

        const windX = customWindX !== null ? customWindX : this.windSpeedX;
        const windZ = customWindZ !== null ? customWindZ : this.windSpeedZ;
        const pgkOn = customPgk !== null ? customPgk : this.isPGKEnabled;

        this.state = {
            time: 0,
            x: 0,                           
            y: 5.0,                         
            z: 0,                           
            vx: v0 * Math.cos(elevationRad),
            vy: v0 * Math.sin(elevationRad),
            vz: 0,                          
            speed: v0,                      
            pitch: angle,                   
            yaw: 0,                         
            spinRateHz: 260,                
            canardPitchDeg: 0,
            canardYawDeg: 0,
            canardRollDeg: 0,
            gForceAxial: 18450,             
            gnssLock: true,
            ekfStateX: 0, 
            ekfStateZ: 0,
            ekfCov: 10.0,                   
            insDriftErrorX: 0,
            insDriftErrorZ: 0,
            isArmed: false,
            detonated: false,
            detonationMode: null,
            detonationPoint: null,
            canardActuationsCount: 0,
            pgkActive: pgkOn
        };

        this.history = [{ ...this.state }];
    }
}
export default BallisticsEngine;
