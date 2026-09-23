import random

import pytest

from physics import BallisticsEngine


def test_monte_carlo_reproducibility():
    # Run 1
    random.seed(12345)
    engine1 = BallisticsEngine()
    res1 = engine1.run_monte_carlo_cep(numRounds=5, guided=True)
    
    # Run 2
    random.seed(12345)
    engine2 = BallisticsEngine()
    res2 = engine2.run_monte_carlo_cep(numRounds=5, guided=True)
    
    assert res1['cepGuided50'] == pytest.approx(res2['cepGuided50'], rel=0.2)
    assert res1['cepGuided90'] == pytest.approx(res2['cepGuided90'], rel=0.2)

def test_cep_calculation_bounds():
    random.seed(42)
    engine = BallisticsEngine()
    res_guided = engine.run_monte_carlo_cep(numRounds=10, guided=True)
    
    random.seed(42)
    engine = BallisticsEngine()
    res_unguided = engine.run_monte_carlo_cep(numRounds=10, guided=False)
    
    # Guided CEP should be significantly smaller than unguided
    assert res_guided['cepGuided50'] < res_unguided['cepUnguided50']

def test_cep_metrics():
    import random
    random.seed(100)
    engine = BallisticsEngine()
    res = engine.run_monte_carlo_cep(numRounds=2)
    assert "cepGuided50" in res
    assert "cepUnguided50" in res
