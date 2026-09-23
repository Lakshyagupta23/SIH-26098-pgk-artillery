# Aegis-155 Deployment Guide

This document outlines how to deploy the Aegis-155 Python backend in both local and production environments.

## Local Deployment (Development)

The project includes startup scripts that make local deployment extremely simple. The backend uses FastAPI and Uvicorn.

### Prerequisites
- **Python 3.11.x** (canonical project target — see `.python-version`). The `Dockerfile` also uses `python:3.11-slim`.
- `pip` package manager.

### Steps
1. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server using the provided scripts:
   - **Windows:** Double-click `start.bat` or run it from the command line.
   - **Linux/macOS:** Make the script executable and run it:
     ```bash
     chmod +x start.sh
     ./start.sh
     ```
3. The server will start at `http://localhost:8000`. You can access the Swagger UI documentation at `http://localhost:8000/docs`.

---

## Production Deployment (Docker)

For production, it is highly recommended to deploy the application using the provided Docker container. This ensures consistent environments and dependencies.

### Environment Variables
Copy the `.env.example` file to `.env` and configure your variables before building/running. 
```bash
cp .env.example .env
```
Key variables:
- `PORT`: The port the container exposes (default 8000).
- `ENVIRONMENT`: Set to `production`.
- `SECRET_KEY`: Required in production. Generate a secure random string (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`).
- `CESIUM_ION_TOKEN`: Token for Cesium globe.
- `DATABASE_URL`: By default, this uses SQLite (`sqlite:///./aegis155.db`), which will be stored inside the container. 

### Building the Docker Image
```bash
docker build -t aegis155-backend .
```

### Running the Container
To run the container and mount a volume for the SQLite database (so data persists across restarts):

```bash
docker run -d \
  --name aegis155 \
  -p 8000:8000 \
  -v $(pwd)/aegis155.db:/app/aegis155.db \
  --env-file .env \
  aegis155-backend
```

*Note: If you use a PostgreSQL database instead, you only need to update the `DATABASE_URL` in your `.env` file and you won't need to mount a volume for SQLite.*

---

## Infrastructure Health & Monitoring

The application exposes a lightweight health-check endpoint for infrastructure monitoring (e.g., Kubernetes liveness/readiness probes or Docker healthchecks).

**Endpoint:** `GET /api/health`
**Expected Response:** `200 OK`

Example:
```bash
curl -f http://localhost:8000/api/health || exit 1
```

## Security Best Practices for Production
- **CORS:** Ensure `CORS_ORIGINS` in your `.env` file is restricted to your exact frontend domain instead of `*`.
- **HTTPS:** Place the Docker container behind a reverse proxy (like Nginx, Traefik, or an AWS Application Load Balancer) to handle SSL/TLS termination. Do not expose Uvicorn directly to the public internet without HTTPS.
