#!/bin/bash
# Startup script for Linux/macOS
# Target Python: 3.11.x (see .python-version, Dockerfile, DEPLOYMENT.md)

echo "======================================"
echo " Starting Aegis-155 Backend (FastAPI) "
echo "======================================"

# Default to port 8000 if not specified in environment
PORT=${PORT:-8000}
HOST=${HOST:-"0.0.0.0"}

# Check Python version (must be 3.11.x)
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" != "3" ] || [ "$PYTHON_MINOR" != "11" ]; then
    echo "WARNING: Python 3.11.x is required. Found: Python $PYTHON_VERSION"
    echo "See .python-version and DEPLOYMENT.md for setup instructions."
fi

# Check if uvicorn is installed
if ! command -v uvicorn &> /dev/null
then
    echo "Error: uvicorn could not be found."
    echo "Please install dependencies using: pip install -r requirements.txt"
    exit 1
fi

# .env handling:
# If .env exists, pass it to uvicorn. If not, rely on environment variables
# already set by the operator. Copy .env.example to .env and populate it first.
if [ -f ".env" ]; then
    echo "Loading configuration from .env..."
    echo "Starting server on $HOST:$PORT..."
    uvicorn main:app --host $HOST --port $PORT --reload --env-file .env
else
    echo "WARNING: .env not found. Using environment variables from shell."
    echo "  To configure: cp .env.example .env && edit .env"
    echo "Starting server on $HOST:$PORT..."
    uvicorn main:app --host $HOST --port $PORT --reload
fi
