import pytest

from physics import BallisticsEngine


def test_physics_initialization():
    engine = BallisticsEngine()
    assert engine.caliber == 0.155
    assert engine.mass == 43.5
    
def test_physics_initialization_defaults():
    engine = BallisticsEngine()
    assert engine.mass == 43.5

def test_trajectory_valid():
    engine = BallisticsEngine()
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    for _ in range(10):
        engine.step(0.1)
    
    assert engine.state.x > 0
    assert engine.state.y > 0
    assert engine.state.time == pytest.approx(1.0)

def test_physics_boundaries():
    engine = BallisticsEngine()
    # Test boundary: negative elevation
    engine.init_flight(customAngle=-10.0, customWindX=0, customWindZ=0, customPgk=False)
    assert engine.state.vy < 0
    engine.step(0.1)
    # Should hit ground almost immediately or instantly depending on logic
    assert engine.state.y <= 0

    # Extreme muzzle velocity should result in higher initial velocity
    engine.muzzleVelocity = 2000.0
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    assert engine.state.vx > 600.0
