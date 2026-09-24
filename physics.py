"""
SOURCE OF TRUTH: This physics.py file contains the canonical mathematical 
models for ballistics, aerodynamics, and the EKF. 
Any frontend physics modules (like physics.js) are strictly for offline UI 
state management and are NOT AUTHORITATIVE.
"""

import copy
import hashlib
import json
import math
import os
import random
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from config import HARDWARE_CONFIG
from esad import ESAD, ESADState


def _run_single_mc_iteration(kwargs):
    # Top-level function to allow multiprocessing Pickling
    iteration_seed = kwargs.get('iteration_seed', 42)
    random.seed(iteration_seed)
    
    engine = BallisticsEngine()
    
    # Configure base engine params
    engine.targetDistance = kwargs['targetDistance']
    engine.launchElevationDeg = kwargs['launchElevationDeg']
    engine.windSpeedX = kwargs['windSpeedX']
    engine.windSpeedZ = kwargs['windSpeedZ']
    engine.isWindShearEnabled = kwargs['isWindShearEnabled']
    engine.windLowX = kwargs.get('windLowX', 0.0)
    engine.windMedX = kwargs.get('windMedX', 0.0)
    engine.windHighX = kwargs.get('windHighX', 0.0)
    engine.windLowZ = kwargs.get('windLowZ', 0.0)
    engine.windMedZ = kwargs.get('windMedZ', 0.0)
    engine.windHighZ = kwargs.get('windHighZ', 0.0)
    engine.latitudeDeg = kwargs['latitudeDeg']
    engine.firingAzimuthDeg = kwargs['firingAzimuthDeg']
    engine.fuzeMode = kwargs['fuzeMode']
    engine.fuzeDelayMs = kwargs.get('fuzeDelayMs', 0.0)
    engine.navigationMode = kwargs.get('navigationMode', 'NORMAL')
    engine.proximityHeight = kwargs.get('proximityHeight', 12.0)
    engine.programmedFlightTime = kwargs.get('programmedFlightTime', 60.0)
    
    engine.isUncertaintyActive = kwargs.get('isUncertaintyActive', True)
    engine.uncGnss = kwargs.get('uncGnss', 4.0)
    engine.uncInsDrift = kwargs.get('uncInsDrift', 0.05)
    engine.uncSensor = kwargs.get('uncSensor', 0.5)
    engine.uncActuator = kwargs.get('uncActuator', 0.1)
    engine.uncTiming = kwargs.get('uncTiming', 2.0)
    
    angle = kwargs['angle']
    windX = kwargs['windX']
    windZ = kwargs['windZ']
    mv = kwargs['mv']
    
    # 1. Run Unguided Shot
    engine.init_flight(customAngle=angle, customWindX=windX, customWindZ=windZ, customPgk=False, customMv=mv)
    stepsU = 0
    while not engine.state.detonated and stepsU < 4000:
        engine.step(0.1)
        stepsU += 1
        
    ptU = engine.state.detonationPoint if engine.state.detonationPoint else {'x': engine.state.x, 'y': engine.state.y, 'z': engine.state.z}
    unguided_impact = {
        'x': float(ptU['x'] - engine.targetDistance),
        'y': float(ptU['y']),
        'z': float(ptU['z']),
        'distErr': float(math.sqrt((ptU['x'] - engine.targetDistance)**2 + ptU['z']**2)),
        'absX': float(ptU['x']),
        'absY': float(ptU['y']),
        'absZ': float(ptU['z'])
    }
    
    # 2. Run PGK Guided Shot
    engine.init_flight(customAngle=angle, customWindX=windX, customWindZ=windZ, customPgk=True, customMv=mv)
    stepsG = 0
    traj = []
    while not engine.state.detonated and stepsG < 4000:
        engine.step(0.1)
        if stepsG % 4 == 0:  # decimate for rendering performance
            traj.append([float(engine.state.x), float(engine.state.y), float(engine.state.z)])
        stepsG += 1
        
    ptG = engine.state.detonationPoint if engine.state.detonationPoint else {'x': engine.state.x, 'y': engine.state.y, 'z': engine.state.z}
    traj.append([float(ptG['x']), float(ptG['y']), float(ptG['z'])])
    
    guided_impact = {
        'x': float(ptG['x'] - engine.targetDistance),
        'y': float(ptG['y']),
        'z': float(ptG['z']),
        'distErr': float(math.sqrt((ptG['x'] - engine.targetDistance)**2 + ptG['z']**2)),
        'absX': float(ptG['x']),
        'absY': float(ptG['y']),
        'absZ': float(ptG['z'])
    }
    
    return unguided_impact, guided_impact, traj


class PhysicsState:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

class BallisticsEngine:
    def __init__(self):
        # Physical Constants
        self.g0 = 9.80665
        self.rho0 = 1.225
        self.R_air = 287.05
        self.gamma = 1.4

        # 155mm Shell Parameters
        self.caliber = 0.155
        self.area = math.pi * ((self.caliber / 2) ** 2)
        self.mass = 43.5
        self.muzzleVelocity = 827
        self.standardCd = 0.22

        # Default Environment & Coriolis Settings
        self.windSpeedX = 5.0
        self.windSpeedZ = 3.0
        self.isWindShearEnabled = False
        
        # Coriolis parameters
        self.latitudeDeg = 21.5
        self.firingAzimuthDeg = 45.0
        self.omegaEarth = 7.292115e-5
        
        # Wind Shear layers
        self.windLowX = 3.0
        self.windLowZ = 2.0
        self.windMedX = 8.0
        self.windMedZ = 5.0
        self.windHighX = 15.0
        self.windHighZ = 10.0

        self.targetDistance = 24000
        self.targetAltitude = 120
        self.launchElevationDeg = 48.5

        self.isPGKEnabled = True
        self.isGNSSJammed = False
        
        # Uncertainty attributes (for Monte Carlo)
        self.isUncertaintyActive = False
        self.uncWind = 0.0
        self.uncAngle = 0.0
        self.uncMuzzle = 0.0
        self.uncGnss = 0.0
        self.uncInsDrift = 0.0
        self.uncSensor = 0.0
        self.uncActuator = 0.0
        self.uncTiming = 0.0
        
        self.canardMaxDeflection = HARDWARE_CONFIG.actuator_max_deflection_deg
        self.navGain = HARDWARE_CONFIG.nav_gain
        
        # Fuze Settings
        self.fuzeMode = 'PROXIMITY'
        self.proximityHeight = 12.0
        self.fuzeDelayMs = 25
        self.programmedFlightTime = 60.0
        self.navigationMode = 'NORMAL'

        self.random_seed = 42
        self.runId = None

        self.esad = None
        self.state = None
        self.history = []

    def get_air_density(self, altitude):
        altitude = max(altitude, 0)
        T = max(216.65, 288.15 - 0.0065 * altitude)
        P = 101325 * pow(T / 288.15, 5.2561)
        return P / (self.R_air * T)

    def get_drag_coefficient(self, speed, altitude):
        T = max(216.65, 288.15 - 0.0065 * altitude)
        speedOfSound = math.sqrt(self.gamma * self.R_air * T)
        mach = speed / speedOfSound

        if mach < 0.8:
            return 0.15
        elif 0.8 <= mach <= 1.2:
            if mach <= 1.0:
                t = (mach - 0.8) * 5.0
                return 0.15 + 0.25 * t * t * (3 - 2 * t)
            else:
                t = (mach - 1.0) * 5.0
                return 0.40 - 0.05 * t * t * (3 - 2 * t)
        else:
            return 0.15 * math.exp(-0.8 * (mach - 1.2)) + 0.20

    def simulate_range_for_mv(self, mv, angle):
        elevationRad = math.radians(angle)
        x = 0
        y = 5.0
        vx = mv * math.cos(elevationRad)
        vy = mv * math.sin(elevationRad)
        time = 0
        dt = 0.04
        
        while y >= 0 and time < 120:
            speed = math.sqrt(vx * vx + vy * vy)
            if speed < 1.0: break
            
            rho = self.get_air_density(y)
            Cd = self.get_drag_coefficient(speed, y)
            qDyn = 0.5 * rho * speed * speed
            F_drag = qDyn * self.area * Cd
            
            ax = -(F_drag / self.mass) * (vx / speed)
            ay = -self.g0 - (F_drag / self.mass) * (vy / speed)
            
            vx += ax * dt
            vy += ay * dt
            x += vx * dt
            y += vy * dt
            time += dt
            
        return x

    def solve_muzzle_velocity(self, targetDist, elevationAngle):
        mv1 = 400
        range1 = self.simulate_range_for_mv(mv1, elevationAngle)
        
        mv2 = 980
        range2 = self.simulate_range_for_mv(mv2, elevationAngle)
        
        for _ in range(6):
            rangeDiff = range2 - range1
            if abs(rangeDiff) < 1.0: break
            mvNext = mv2 - (range2 - targetDist) * (mv2 - mv1) / rangeDiff
            mvClamped = max(300, min(1050, mv2 if math.isnan(mvNext) else mvNext))
            
            mv1 = mv2
            range1 = range2
            
            mv2 = mvClamped
            range2 = self.simulate_range_for_mv(mv2, elevationAngle)
            
            if abs(range2 - targetDist) < 10.0: break
            
        return 827 if math.isnan(mv2) else mv2

    def init_flight(self, customAngle=None, customWindX=None, customWindZ=None, customPgk=None, customMv=None):
        angle = customAngle if customAngle is not None else self.launchElevationDeg
        elevationRad = math.radians(angle)
        
        if customWindX is not None: self.windSpeedX = customWindX
        if customWindZ is not None: self.windSpeedZ = customWindZ
        
        if customMv is not None:
            self.muzzleVelocity = customMv
        else:
            self.muzzleVelocity = self.solve_muzzle_velocity(self.targetDistance, angle)
            
        v0 = self.muzzleVelocity

        pgkOn = customPgk if customPgk is not None else self.isPGKEnabled

        self.state = PhysicsState(
            time=0,
            x=0, y=5.0, z=0,
            vx=v0 * math.cos(elevationRad),
            vy=v0 * math.sin(elevationRad),
            vz=0,
            speed=v0,
            mach=v0 / math.sqrt(self.gamma * self.R_air * max(216.65, 288.15 - 0.0065 * 5.0)),
            pitch=angle,
            yaw=0,
            spinRateHz=260,
            canardPitchDeg=0,
            canardYawDeg=0,
            canardRollDeg=0,
            gForceAxial=18450,
            gnssLock=True,
            ekfStateX=0, ekfStateZ=0,
            ekfCov=10.0,
            insDriftErrorX=0, insDriftErrorZ=0,
            isArmed=False,
            detonated=False,
            detonationMode=None,
            detonationPoint=None,
            canardActuationsCount=0,
            pgkActive=pgkOn
        )
        
        self.esad = ESAD()
        # Simulated setback pulse from muzzle exit
        self.esad.update(time=0, g_force_axial=self.state.gForceAxial, spin_hz=self.state.spinRateHz)
        self.state.isArmed = (self.esad.state == ESADState.ARMED)

        self.history = [self.state]

    def step(self, dt=0.04):
        if not self.state or self.state.detonated:
            return self.state

        s = self.state

        currentWindX = self.windSpeedX
        currentWindZ = self.windSpeedZ
        if self.isWindShearEnabled:
            def lerp(a, b, t): return a + (b - a) * max(0, min(1, t))
            if s.y < 4000:
                currentWindX = lerp(self.windSpeedX, self.windLowX, s.y / 4000)
                currentWindZ = lerp(self.windSpeedZ, self.windLowZ, s.y / 4000)
            elif s.y < 8000:
                currentWindX = lerp(self.windLowX, self.windMedX, (s.y - 4000) / 4000)
                currentWindZ = lerp(self.windLowZ, self.windMedZ, (s.y - 4000) / 4000)
            else:
                currentWindX = lerp(self.windMedX, self.windHighX, min(1, (s.y - 8000) / 4000))
                currentWindZ = lerp(self.windMedZ, self.windHighZ, min(1, (s.y - 8000) / 4000))

        vRelX = s.vx - currentWindX
        vRelY = s.vy
        vRelZ = s.vz - currentWindZ
        speedRel = math.sqrt(vRelX**2 + vRelY**2 + vRelZ**2)

        if speedRel < 1.0 or s.y < 0:
            if getattr(self, 'fuzeMode', '') == 'DELAY':
                if not getattr(s, 'impacted', False):
                    s.impacted = True
                    s.impactTime = s.time
                    s.impactVx = s.vx
                    s.impactVy = s.vy
                    s.impactVz = s.vz
                
                s.time += dt
                s.vx *= 0.95
                s.vy *= 0.95
                s.vz *= 0.95
                s.x += s.vx * dt
                s.y += s.vy * dt
                s.z += s.vz * dt
                
                uncTiming = getattr(self, 'uncTiming', 2.0) if getattr(self, 'isUncertaintyActive', True) else 0.0
                jitterSec = random.gauss(0, uncTiming) / 1000.0
                delaySec = getattr(self, 'fuzeDelayMs', 0.0) / 1000.0
                if s.time - s.impactTime >= (delaySec + jitterSec):
                    if not s.detonated:
                        s.detonated = True
                        s.detonationMode = f"DELAY ({getattr(self, 'fuzeDelayMs', 0.0)}ms)"
                        s.detonationPoint = {'x': s.x, 'y': s.y, 'z': s.z}
                self.history.append(copy.deepcopy(s))
                return s
            else:
                if not s.detonated:
                    s.detonated = True
                    s.detonationMode = 'POINT_DETONATION (IMPACT)'
                    s.detonationPoint = {'x': s.x, 'y': max(0, s.y), 'z': s.z}
                self.history.append(copy.deepcopy(s))
                return s

        rho = self.get_air_density(s.y)
        Cd = self.get_drag_coefficient(speedRel, s.y)
        qDyn = 0.5 * rho * speedRel * speedRel

        F_drag = qDyn * self.area * Cd
        aDragX = -(F_drag / self.mass) * (vRelX / speedRel)
        aDragY = -(F_drag / self.mass) * (vRelY / speedRel)
        aDragZ = -(F_drag / self.mass) * (vRelZ / speedRel)

        newSpinHz = max(40, s.spinRateHz - 1.2 * dt)
        aMagnusZ = 0.00035 * (newSpinHz / 250) * speedRel

        aCanardX, aCanardY, aCanardZ = 0, 0, 0
        canardP, canardYw = 0, 0

        distanceToTarget = math.sqrt((self.targetDistance - s.x)**2 + (self.targetAltitude - s.y)**2 + (0 - s.z)**2)

        if s.pgkActive and s.vy < 35.0 and s.y > 20:
            
            uncIns = getattr(self, 'uncInsDrift', 0.05) if getattr(self, 'isUncertaintyActive', True) else 0.0
            uncGnss = getattr(self, 'uncGnss', 4.0) if getattr(self, 'isUncertaintyActive', True) else 0.0
            
            s.insDriftErrorX += uncIns * (random.random() - 0.5) * dt
            s.insDriftErrorZ += uncIns * (random.random() - 0.5) * dt
            
            s.ekfStateX += (s.vx + s.insDriftErrorX) * dt
            s.ekfStateZ += (s.vz + s.insDriftErrorZ) * dt
            s.ekfCov += 2.0 * dt
            
            if getattr(self, 'navigationMode', 'NORMAL') != 'DENIED':
                if getattr(self, 'navigationMode', 'NORMAL') == 'DEGRADED':
                    uncGnss *= 5.0
                    R = 50.0
                else:
                    R = 5.0

                # Approximate normal distribution using Irwin-Hall
                gnssNoiseX = (random.random() + random.random() + random.random() - 1.5) * uncGnss
                gnssNoiseZ = (random.random() + random.random() + random.random() - 1.5) * uncGnss
                zX = s.x + gnssNoiseX
                zZ = s.z + gnssNoiseZ
                
                K = s.ekfCov / (s.ekfCov + R)
                
                s.ekfStateX = s.ekfStateX + K * (zX - s.ekfStateX)
                s.ekfStateZ = s.ekfStateZ + K * (zZ - s.ekfStateZ)
                s.ekfCov = (1 - K) * s.ekfCov
                
                s.insDriftErrorX *= 0.95
                s.insDriftErrorZ *= 0.95

            dx = self.targetDistance - s.ekfStateX
            dy = self.targetAltitude - s.y
            dz = 0 - s.ekfStateZ
            dist = math.sqrt(dx*dx + dy*dy + dz*dz)
            
            losRatePitch = (dy * s.vx - dx * s.vy) / (dx*dx + dy*dy + 1e-6)
            losRateYaw = (dz * s.vx - dx * s.vz) / (dx*dx + dz*dz + 1e-6)
            
            Vc = (dx * s.vx + dy * s.vy + dz * s.vz) / (dist + 1e-6)
            
            N = self.navGain
            aCmdPitch = N * Vc * losRatePitch + self.g0 * math.cos(math.radians(s.pitch))
            aCmdYaw = N * Vc * losRateYaw
            
            canardArea = 0.0095
            Cl_alpha = 3.8
            
            safeQdyn = max(1.0, qDyn)
            requiredCanardP = (aCmdPitch * self.mass) / (safeQdyn * canardArea * Cl_alpha) * (180 / math.pi)
            requiredCanardYw = (aCmdYaw * self.mass) / (safeQdyn * canardArea * Cl_alpha) * (180 / math.pi)

            cmdP = max(-self.canardMaxDeflection, min(self.canardMaxDeflection, requiredCanardP))
            cmdYw = max(-self.canardMaxDeflection, min(self.canardMaxDeflection, requiredCanardYw))

            maxSlew = HARDWARE_CONFIG.actuator_max_slew_rate_deg_s * dt
            currentP = s.canardPitchDeg
            currentY = s.canardYawDeg
            canardP = currentP + max(-maxSlew, min(maxSlew, cmdP - currentP))
            canardYw = currentY + max(-maxSlew, min(maxSlew, cmdYw - currentY))
            
            uncAct = getattr(self, 'uncActuator', 0.1) if getattr(self, 'isUncertaintyActive', True) else 0.0
            if uncAct > 0:
                canardP += random.gauss(0, uncAct)
                canardYw += random.gauss(0, uncAct)

            liftPitch = qDyn * canardArea * Cl_alpha * (canardP * math.pi / 180)
            liftYaw   = qDyn * canardArea * Cl_alpha * (canardYw * math.pi / 180)

            aCanardY = (liftPitch / self.mass)
            aCanardZ = (liftYaw / self.mass)

            if abs(canardP) > 0.5 or abs(canardYw) > 0.5:
                s.canardActuationsCount += 1

        latRad = math.radians(self.latitudeDeg)
        azRad = math.radians(self.firingAzimuthDeg)
        
        wx_c = self.omegaEarth * math.cos(latRad) * math.cos(azRad)
        wy_c = self.omegaEarth * math.sin(latRad)
        wz_c = -self.omegaEarth * math.cos(latRad) * math.sin(azRad)

        aCoriolisX = -2.0 * (wy_c * s.vz - wz_c * s.vy)
        aCoriolisY = -2.0 * (wz_c * s.vx - wx_c * s.vz)
        aCoriolisZ = -2.0 * (wx_c * s.vy - wy_c * s.vx)

        ax = aDragX + aCanardX + aCoriolisX
        ay = -self.g0 + aDragY + aCanardY + aCoriolisY
        az = aDragZ + aMagnusZ + aCanardZ + aCoriolisZ

        gForceAxial = math.sqrt(ax*ax + ay*ay + az*az) / self.g0

        s.vx += ax * dt
        s.vy += ay * dt
        s.vz += az * dt

        s.x += s.vx * dt
        s.y += s.vy * dt
        s.z += s.vz * dt

        s.time += dt

        s.pitch = math.degrees(math.atan2(s.vy, s.vx))
        s.yaw = math.degrees(math.atan2(s.vz, s.vx))

        s.isArmed = (self.esad.update(s.time, gForceAxial, newSpinHz) == ESADState.ARMED)

        uncSensor = getattr(self, 'uncSensor', 0.5) if getattr(self, 'isUncertaintyActive', True) else 0.0
        sensedHeight = s.y + random.gauss(0, uncSensor)
        if s.isArmed and self.fuzeMode == 'PROXIMITY' and sensedHeight <= self.proximityHeight and s.vy < 0:
            s.detonated = True
            s.detonationMode = f"PROXIMITY AIRBURST (HoB: {self.proximityHeight}m)"
            s.detonationPoint = {'x': s.x, 'y': s.y, 'z': s.z}
            
        uncTiming = getattr(self, 'uncTiming', 2.0) if getattr(self, 'isUncertaintyActive', True) else 0.0
        jitterSec = random.gauss(0, uncTiming) / 1000.0
        if s.isArmed and self.fuzeMode == 'TIME' and s.time >= (self.programmedFlightTime + jitterSec):
            s.detonated = True
            s.detonationMode = f"TIME AIRBURST ({self.programmedFlightTime}s)"
            s.detonationPoint = {'x': s.x, 'y': s.y, 'z': s.z}

        s.speed = math.sqrt(s.vx**2 + s.vy**2 + s.vz**2)
        s.mach = s.speed / math.sqrt(self.gamma * self.R_air * max(216.65, 288.15 - 0.0065 * s.y))
        s.spinRateHz = newSpinHz
        s.canardPitchDeg = canardP
        s.canardYawDeg = canardYw
        s.gForceAxial = gForceAxial

        # Save snapshot
        
        self.history.append(copy.deepcopy(s))
        return s

    def run_full_simulation(self, customAngle=None, customWindX=None, customWindZ=None, customPgk=None):
        self.init_flight(customAngle, customWindX, customWindZ, customPgk)
        stepCount = 0
        while not self.state.detonated and stepCount < 10000:
            self.step(0.04)
            stepCount += 1
        return self.history

    def run_sensitivity_analysis(self, runs=5):
        results = []
        nominal_mv = 827.0
        offsets = [-15.0, -10.0, -5.0, 0.0, 5.0, 10.0, 15.0]
        for offset in offsets:
            mv = nominal_mv + offset
            
            # unguided
            self.init_flight(customAngle=self.launchElevationDeg, customPgk=False, customMuzzle=mv)
            while self.state.y >= 0 and self.state.time < 200.0:
                self.step(0.1)
            dist_unguided = self.state.x
            
            # guided
            self.init_flight(customAngle=self.launchElevationDeg, customPgk=True, customMuzzle=mv)
            while self.state.y >= 0 and self.state.time < 200.0:
                self.step(0.1)
            dist_guided = self.state.x
            
            results.append({
                "muzzle_velocity": mv,
                "range_unguided": dist_unguided,
                "range_guided": dist_guided
            })
            
        return {"data": results}

    def run_monte_carlo_cep(self, numRounds=80, guided=True, cancel_flag=None, progress_callback=None, override_nominal_mv=None):
        if hasattr(self, 'random_seed') and self.random_seed is not None:
            np.random.seed(self.random_seed)
            random.seed(self.random_seed)
            
        is_unc = getattr(self, 'isUncertaintyActive', True)
        unc_wind = getattr(self, 'uncWind', 1.5) if is_unc else 0.0
        unc_angle = getattr(self, 'uncAngle', 0.1) if is_unc else 0.0
        unc_mv = getattr(self, 'uncMuzzle', 2.0) if is_unc else 0.0
        unc_gnss = getattr(self, 'uncGnss', 4.0) if is_unc else 0.0
        unc_ins = getattr(self, 'uncInsDrift', 0.05) if is_unc else 0.0
        unc_sensor = getattr(self, 'uncSensor', 0.5) if is_unc else 0.0
        unc_actuator = getattr(self, 'uncActuator', 0.1) if is_unc else 0.0
        unc_timing = getattr(self, 'uncTiming', 2.0) if is_unc else 0.0
            
        wind_noises_x = self.windSpeedX + np.random.normal(0, unc_wind, numRounds)
        wind_noises_z = self.windSpeedZ + np.random.normal(0, unc_wind, numRounds)
        angle_noises = self.launchElevationDeg + np.random.normal(0, unc_angle, numRounds)
        
        if override_nominal_mv is not None:
            nominal_mv = override_nominal_mv
        else:
            nominal_mv = self.solve_muzzle_velocity(self.targetDistance, self.launchElevationDeg)
            
        mv_noises = nominal_mv + np.random.normal(0, unc_mv, numRounds)
        
        tasks = []
        for i in range(numRounds):
            tasks.append({
                'targetDistance': self.targetDistance,
                'launchElevationDeg': self.launchElevationDeg,
                'windSpeedX': self.windSpeedX,
                'windSpeedZ': self.windSpeedZ,
                'isWindShearEnabled': self.isWindShearEnabled,
                'windLowX': getattr(self, 'windLowX', 0.0),
                'windMedX': getattr(self, 'windMedX', 0.0),
                'windHighX': getattr(self, 'windHighX', 0.0),
                'windLowZ': getattr(self, 'windLowZ', 0.0),
                'windMedZ': getattr(self, 'windMedZ', 0.0),
                'windHighZ': getattr(self, 'windHighZ', 0.0),
                'latitudeDeg': self.latitudeDeg,
                'firingAzimuthDeg': self.firingAzimuthDeg,
                'fuzeMode': self.fuzeMode,
                'fuzeDelayMs': getattr(self, 'fuzeDelayMs', 0.0),
                'navigationMode': getattr(self, 'navigationMode', 'NORMAL'),
                'proximityHeight': getattr(self, 'proximityHeight', 12.0),
                'programmedFlightTime': getattr(self, 'programmedFlightTime', 60.0),
                'isUncertaintyActive': is_unc,
                'uncGnss': unc_gnss,
                'uncInsDrift': unc_ins,
                'uncSensor': unc_sensor,
                'uncActuator': unc_actuator,
                'uncTiming': unc_timing,
                'angle': angle_noises[i],
                'windX': wind_noises_x[i],
                'windZ': wind_noises_z[i],
                'mv': mv_noises[i],
                'iteration_seed': (self.random_seed + i) if getattr(self, 'random_seed', None) is not None else random.randint(0, 999999)
            })
            
        unguidedImpacts = []
        guidedImpacts = []
        guidedTrajectories = []
        
        # Hardcode to 2 workers to prevent Render free tier out-of-memory (OOM) errors
        max_workers = 2
        
        completed_count = 0
        
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            # Use map to guarantee results are returned in the exact order they were submitted
            # This ensures deterministic arrays for JSON serialization and hashing
            results_iter = executor.map(_run_single_mc_iteration, tasks)
            for result in results_iter:
                if cancel_flag and cancel_flag.get("is_cancelled", False):
                    raise Exception("Job cancelled by user")
                
                u_imp, g_imp, g_traj = result
                unguidedImpacts.append(u_imp)
                guidedImpacts.append(g_imp)
                guidedTrajectories.append(g_traj)
                
                completed_count += 1
                if progress_callback:
                    progress_callback(completed_count / float(numRounds))
            
        guidedImpacts.sort(key=lambda item: item['distErr'])
        unguidedImpacts.sort(key=lambda item: item['distErr'])
        
        median_idx = min(int(numRounds * 0.5), numRounds - 1) if numRounds > 0 else 0
        p90_idx = min(int(numRounds * 0.9), numRounds - 1) if numRounds > 0 else 0
        
        cepGuided50 = guidedImpacts[median_idx]['distErr']
        cepGuided90 = guidedImpacts[p90_idx]['distErr']
        
        cepUnguided50 = unguidedImpacts[median_idx]['distErr']
        cepUnguided90 = unguidedImpacts[p90_idx]['distErr']
        
        sumX = sum([pt['x'] for pt in guidedImpacts])
        sumY = sum([pt['y'] for pt in guidedImpacts])
        sumZ = sum([pt['z'] for pt in guidedImpacts])
        
        meanX = sumX / numRounds
        meanY = sumY / numRounds
        meanZ = sumZ / numRounds
        
        varX = sum([(pt['x'] - meanX) ** 2 for pt in guidedImpacts]) / numRounds
        varY = sum([(pt['y'] - meanY) ** 2 for pt in guidedImpacts]) / numRounds
        varZ = sum([(pt['z'] - meanZ) ** 2 for pt in guidedImpacts]) / numRounds
        
        stdX = math.sqrt(varX)
        stdY = math.sqrt(varY)
        stdZ = math.sqrt(varZ)
        
        # 95% Confidence Interval for the mean
        # CI = mean +/- (1.96 * std / sqrt(n))
        ci95X = 1.96 * stdX / math.sqrt(numRounds) if numRounds > 0 else 0
        ci95Z = 1.96 * stdZ / math.sqrt(numRounds) if numRounds > 0 else 0
        
        # Radial statistics
        radial_errors = [pt['distErr'] for pt in guidedImpacts]
        mean_radial = sum(radial_errors) / numRounds
        max_radial = max(radial_errors)
        var_radial = sum([(e - mean_radial)**2 for e in radial_errors]) / numRounds
        std_radial = math.sqrt(var_radial)
        
        minX = min([pt['x'] for pt in guidedImpacts])
        minY = min([pt['y'] for pt in guidedImpacts])
        minZ = min([pt['z'] for pt in guidedImpacts])
        
        maxX = max([pt['x'] for pt in guidedImpacts])
        maxY = max([pt['y'] for pt in guidedImpacts])
        maxZ = max([pt['z'] for pt in guidedImpacts])
        
        # Deterministic result hashing
        def format_impacts_for_hash(pts):
            return [{"x": round(p['x'], 4), "z": round(p['z'], 4)} for p in pts]
            
        hash_payload = json.dumps({
            "guided": format_impacts_for_hash(guidedImpacts),
            "unguided": format_impacts_for_hash(unguidedImpacts)
        }, sort_keys=True)
        result_hash = hashlib.sha256(hash_payload.encode()).hexdigest()[:8]
        
        return {
            'numRounds': numRounds,
            'cepGuided50': float(cepGuided50),
            'cepGuided90': float(cepGuided90),
            'cepUnguided50': float(cepUnguided50),
            'cepUnguided90': float(cepUnguided90),
            'meanRadialError': float(mean_radial),
            'maxRadialError': float(max_radial),
            'stdRadialError': float(std_radial),
            'ci95Radial': float(1.96 * std_radial / math.sqrt(numRounds) if numRounds > 0 else 0),
            'random_seed': getattr(self, 'random_seed', None),
            'resultHash': result_hash,
            'guidedImpacts': guidedImpacts,
            'unguidedImpacts': unguidedImpacts,
            'guidedTrajectories': guidedTrajectories,
            'stats': {
                'mean': {'x': float(meanX), 'y': float(meanY), 'z': float(meanZ)},
                'std': {'x': float(stdX), 'y': float(stdY), 'z': float(stdZ)},
                'min': {'x': float(minX), 'y': float(minY), 'z': float(minZ)},
                'max': {'x': float(maxX), 'y': float(maxY), 'z': float(maxZ)},
                'range': {'x': float(maxX - minX), 'y': float(maxY - minY), 'z': float(maxZ - minZ)},
                'ci95': {'x': float(ci95X), 'z': float(ci95Z)}
            }
        }

    def export_csv(self):
        lines = ["Time(s),Phase,X(m),Y(m),Z(m)"]
        for s in self.history:
            # If phase isn't tracked, we can just use "FLIGHT" or check detonated
            phase = "BOOST" if getattr(s, 'time', 0) < 2.0 else "BALLISTIC" 
            if getattr(s, 'detonated', False):
                phase = "IMPACT"
            lines.append(f"{s.time:.3f},{phase},{s.x:.3f},{s.y:.3f},{s.z:.3f}")
        return "\n".join(lines)
