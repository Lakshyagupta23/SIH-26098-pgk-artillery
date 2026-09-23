from esad import ESAD, ESADState


def test_esad_initialization():
    esad = ESAD()
    assert esad.state == ESADState.SAFE
    assert not esad.has_setback
    assert not esad.has_spin

def test_esad_nominal_sequence():
    esad = ESAD()
    
    # 1. Setback
    esad.update(time=0.1, g_force_axial=15000.0, spin_hz=0.0)
    assert esad.state == ESADState.SETBACK_DETECTED
    assert esad.has_setback
    assert not esad.has_spin
    
    # 2. Spin
    esad.update(time=0.5, g_force_axial=0.0, spin_hz=200.0)
    assert esad.state == ESADState.SPIN_DETECTED
    assert esad.has_spin
    
    # 3. Time
    esad.update(time=2.0, g_force_axial=0.0, spin_hz=200.0)
    assert esad.state == ESADState.ARMED

def test_esad_out_of_order_spin():
    esad = ESAD()
    
    # Spin before setback should not trigger spin detection
    esad.update(time=0.1, g_force_axial=100.0, spin_hz=200.0)
    assert esad.state == ESADState.SAFE
    assert not esad.has_spin
    
    # Now valid setback
    esad.update(time=0.2, g_force_axial=15000.0, spin_hz=0.0)
    assert esad.state == ESADState.SETBACK_DETECTED

def test_esad_insufficient_forces():
    esad = ESAD()
    # Below threshold setback
    esad.update(time=0.1, g_force_axial=9000.0, spin_hz=0.0)
    assert esad.state == ESADState.SAFE
    
    # Setback achieved
    esad.update(time=0.2, g_force_axial=15000.0, spin_hz=0.0)
    assert esad.state == ESADState.SETBACK_DETECTED
    
    # Below threshold spin
    esad.update(time=0.3, g_force_axial=0.0, spin_hz=100.0)
    assert esad.state == ESADState.SETBACK_DETECTED
    
    # Below threshold time
    esad.update(time=1.0, g_force_axial=0.0, spin_hz=200.0)
    assert esad.state == ESADState.SPIN_DETECTED
