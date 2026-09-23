from physics import BallisticsEngine


def test_csv_export_format():
    engine = BallisticsEngine()
    engine.init_flight(customAngle=45.0, customWindX=0, customWindZ=0, customPgk=False)
    # Step exactly a few times
    for _ in range(5):
        engine.step(0.1)
        
    csv_str = engine.export_csv()
    
    # Check headers exist
    assert "Time(s),Phase,X(m),Y(m),Z(m)" in csv_str
    
    # Check lines exist
    lines = csv_str.strip().split('\n')
    assert len(lines) >= 6 # Header + initial + 5 steps depending on recording logic

def test_validation_logic():
    engine = BallisticsEngine()
    engine.init_flight(customAngle=45.0)
    assert engine.state.x == 0.0
    assert engine.state.y == 5.0
    assert engine.state.z == 0.0
