from esad import ESAD, ESADState
from physics import BallisticsEngine


def test_esad_arming_sequence():
    esad = ESAD()
    assert esad.state == ESADState.SAFE
    esad.update(time=0.01, g_force_axial=12000, spin_hz=0)
    assert esad.state == ESADState.SETBACK_DETECTED
    esad.update(time=1.0, g_force_axial=0, spin_hz=200)
    assert esad.state == ESADState.SPIN_DETECTED
    esad.update(time=1.6, g_force_axial=0, spin_hz=200)
    assert esad.state == ESADState.ARMED

def test_fuze_mode_proximity():
    engine = BallisticsEngine()
    engine.fuzeMode = 'PROXIMITY'
    engine.proximityHeight = 15.0
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    
    # Bypass ESAD to force armed state
    engine.esad.update = lambda *args: ESADState.ARMED

    engine.state.y = 14.0
    engine.state.vy = -10.0
    engine.state.isArmed = True
    engine.step(0.1)
    # the proximity height check triggers
    assert engine.state.detonated is True
    assert engine.state.y > 0

def test_fuze_mode_time():
    engine = BallisticsEngine()
    engine.fuzeMode = 'TIME'
    engine.programmedFlightTime = 5.0
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    
    # Bypass ESAD to force armed state
    engine.esad.update = lambda *args: ESADState.ARMED

    engine.state.time = 5.1
    engine.state.isArmed = True
    engine.step(0.1)
    assert engine.state.detonated is True
    assert engine.state.y > 0

def test_fuze_mode_pd():
    # Point Detonating (default)
    engine = BallisticsEngine()
    engine.fuzeMode = 'PD'
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    
    # Bypass ESAD to force armed state
    engine.esad.update = lambda *args: ESADState.ARMED

    engine.state.y = -0.1
    engine.state.vy = -10.0
    engine.state.isArmed = True
    engine.step(0.1)
    assert engine.state.detonated is True
    # Should happen near ground
    assert engine.state.y <= 0
