import os
import sys


def verify_auth_crash():
    # Test 1: Production with AUTH_ENABLED=false should crash
    os.environ["ENVIRONMENT"] = "production"
    os.environ["AUTH_ENABLED"] = "false"
    try:
        print("FAIL: Expected exception when importing security with AUTH_ENABLED=false in production")
        sys.exit(1)
    except RuntimeError as e:
        if "AUTH_ENABLED=False is not allowed in production" in str(e):
            print("PASS: Security module correctly raises exception for AUTH_ENABLED=false in production")
        else:
            print(f"FAIL: Unexpected exception: {e}")
            sys.exit(1)

def verify_demo_crash():
    # Test 2: Demo mode without password should crash
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DEMO_MODE"] = "true"
    if "DEMO_ADMIN_PASSWORD" in os.environ:
        del os.environ["DEMO_ADMIN_PASSWORD"]
    
    # We need to trigger the FastAPI lifespan to test this
    import subprocess
    result = subprocess.run([sys.executable, "-c", "from fastapi.testclient import TestClient; from main import app\nwith TestClient(app): pass"], capture_output=True, text=True, cwd="d:/LAKSHYA/New folder (3)/projects/sih-26098-pgk-artillery/sih-26098-pgk-artillery-python-deployable", check=False)
    
    if result.returncode != 0 and "DEMO_MODE=true requires DEMO_ADMIN_PASSWORD to be set" in str(result.stderr):
        print("PASS: Main module correctly crashes when DEMO_MODE=true without password")
    else:
        print(f"FAIL: Main module did not crash as expected. Code: {result.returncode}, Stderr: {result.stderr}")
        sys.exit(1)

def verify_demo_prod_crash():
    # Test 3: Demo mode in production should crash
    os.environ["ENVIRONMENT"] = "production"
    os.environ["DEMO_MODE"] = "true"
    os.environ["AUTH_ENABLED"] = "true"
    os.environ["SECRET_KEY"] = "dummy-secret-key-that-is-long-enough"
    
    import subprocess
    result = subprocess.run([sys.executable, "-c", "from fastapi.testclient import TestClient; from main import app\nwith TestClient(app): pass"], capture_output=True, text=True, cwd="d:/LAKSHYA/New folder (3)/projects/sih-26098-pgk-artillery/sih-26098-pgk-artillery-python-deployable", check=False)
    
    if result.returncode != 0 and "DEMO_MODE=true is not allowed in production" in str(result.stderr):
        print("PASS: Main module correctly crashes when DEMO_MODE=true in production")
    else:
        print(f"FAIL: Main module did not crash as expected for demo in prod. Code: {result.returncode}, Stderr: {result.stderr}")
        sys.exit(1)


if __name__ == "__main__":
    verify_auth_crash()
    verify_demo_crash()
    verify_demo_prod_crash()
    print("ALL TESTS PASSED")
