from physics import BallisticsEngine


def test_navigation_mode_normal():
    engine = BallisticsEngine()
    engine.navigationMode = 'NORMAL'
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=True)
    assert getattr(engine, 'navigationMode', 'NORMAL') == 'NORMAL'

def test_navigation_mode_gnss_denied():
    engine = BallisticsEngine()
    engine.navigationMode = 'DENIED'
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=True)
    assert getattr(engine, 'navigationMode', 'NORMAL') == 'DENIED'

def test_ekf_covariance_growth():
    engine = BallisticsEngine()
    engine.navigationMode = 'DENIED'
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=True)
    # Fast forward to apogee so PGK activates
    engine.state.y = 1000.0
    engine.state.vy = 0.0

    initial_p = engine.state.ekfCov
    engine.step(0.1)
    new_p = engine.state.ekfCov
    assert new_p > initial_p
