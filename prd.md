# Product Requirements Document (PRD)
## AEGIS-155: Precision Guidance Kit

### 1. Overview
The AEGIS-155 system is a concept-stage Precision Guidance Kit (PGK) and Multi-Mode Electronic Fuze designed as a low-cost strap-on upgrade for existing 155mm artillery shells.

### 2. Core Features
- **Canard Actuation Assembly (CAA)** for aerodynamic steering.
- **GNSS + INS hybrid navigation** via Extended Kalman Filter.
- **Multi-mode smart fuze**: Proximity, Time, Impact, Delay.
- **3D Flight Dynamics** simulation engine.
- **Offline Dashboard**: A comprehensive web-based engineering portal mapping out bill of materials (BOM), requirements, test results, and power usage.

### 3. Technical Stack
- **Backend**: FastAPI (Python), SQLite (SQLAlchemy)
- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3, Chart.js, Cesium.js / Leaflet
- **Deployment**: Uvicorn server, standalone or Dockerized.

### 4. Goals & Constraints
- Implement 100% offline functionality.
- Emphasize traceability and verification tracking.
- Distinguish validation levels: SIMULATED, DESIGN ESTIMATE, REPRESENTATIVE, BENCH MEASURED, HARDWARE MEASURED, VALIDATED, NOT VALIDATED.
