# AEGIS-155: Precision Guidance Kit (PGK) & Multi-Mode Electronic Fuze

[![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![Framework](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![Database](https://img.shields.io/badge/SQLite%20%2F%20SQLAlchemy-2.0-red.svg)](https://www.sqlalchemy.org/)
[![Docker](https://img.shields.io/badge/Docker-Deployable-2496ED.svg)](https://www.docker.com/)
[![Compliance](https://img.shields.io/badge/Safety-MIL--STD--1316%20%7C%20STANAG%204187-orange.svg)]()
[![SIH Problem Statement](https://img.shields.io/badge/SIH%202024-PS--26098-darkgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

An end-to-end engineering platform and high-fidelity exterior ballistics simulator for the **AEGIS-155**, a strap-on Precision Guidance Kit (PGK) and Multi-Mode Electronic Fuze designed for standard 155mm artillery shells (NATO standard / Indian Artillery platforms such as Bofors FH-77B, Dhanush, ATAGS, and K9 Vajra-T).

Developed for **Smart India Hackathon (Problem Statement 26098)**, AEGIS-155 bridges the gap between expensive guided projectiles (e.g., M982 Excalibur at ~$70,000/round) and standard unguided high-explosive shells (~$800-$2,000/round). By screwing into the standard fuze well of legacy 155mm projectiles, AEGIS-155 converts dumb shells into precision-guided munitions, reducing Circular Error Probable (CEP50) from **>150-250 meters** down to **<10 meters**.

---

## Table of Contents

- [Mission Overview & Operational Problem](#mission-overview--operational-problem)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
  - [1. 6-DOF Exterior Ballistics & Aerodynamics Engine](#1-6-dof-exterior-ballistics--aerodynamics-engine)
  - [2. Guidance, Navigation & Control (GNC)](#2-guidance-navigation--control-gnc)
  - [3. Electronic Safe, Arm, and Detonate (ESAD) Architecture](#3-electronic-safe-arm-and-detonate-esad-architecture)
  - [4. Multi-Mode Smart Fuze Capabilities](#4-multi-mode-smart-fuze-capabilities)
  - [5. Monte Carlo Statistical Dispersion Engine](#5-monte-carlo-statistical-dispersion-engine)
  - [6. Systems Engineering: Bill of Materials & Power Budget](#6-systems-engineering-bill-of-materials--power-budget)
- [Offline-First Tactical Ground Station UI](#offline-first-tactical-ground-station-ui)
- [REST API Reference & Data Contracts](#rest-api-reference--data-contracts)
- [Hardware Telemetry Gateway & Fault Injection](#hardware-telemetry-gateway--fault-injection)
- [Verification & Testing](#verification--testing)
- [Getting Started & Local Deployment](#getting-started--local-deployment)
  - [Prerequisites](#prerequisites)
  - [Quickstart (Windows / Linux / macOS)](#quickstart-windows--linux--macos)
  - [Docker Container Deployment](#docker-container-deployment)
- [Environment Configuration](#environment-configuration)
- [Repository Structure](#repository-structure)

---

## Mission Overview & Operational Problem

Conventional artillery bombardments at typical operational ranges (20 km to 30 km) suffer from severe ballistic dispersion caused by:
- Muzzle velocity variations (+/- 5 m/s due to propellant temperature and barrel wear)
- High-altitude wind shears and crosswinds
- Variations in atmospheric pressure and temperature
- Shell mass, center of gravity, and projectile aerodynamic imperfections

This results in a typical unguided **CEP50 exceeding 150 to 250 meters**, necessitating heavy ammunition expenditure (up to 50+ shells to neutralize a point target) and drastically escalating collateral damage and logistics strain.

**The AEGIS-155 Solution:**
- Replaces standard mechanical or single-mode electronic fuzes.
- Employs a free-spinning nose canard assembly that de-spins relative to the 15,000+ RPM shell body.
- Uses aerodynamic drag and steerable canard lift to perform continuous trajectory corrections in both range and deflection.
- Incorporates military-grade ESAD safety logic with dual environmental sensing.
- Engineered for a target production cost under **$1,500 USD per unit**.

---

## Key Features

- **Authoritative Mathematical Modeling:** True Modified Point Mass (MPM) 6-DOF non-linear equations of motion incorporating Coriolis, Magnus, variable atmospheric density, and Mach-dependent aerodynamic drag tables.
- **Hybrid GNSS / INS Extended Kalman Filter (EKF):** Tightly integrates simulated multi-constellation GNSS (GPS/NavIC) with high-G strapdown inertial measurement units to provide robust state estimation even through GNSS jamming scenarios.
- **MIL-STD-1316 / STANAG 4187 Compliance:** Complete Electronic Safe, Arm, and Detonate (ESAD) software state machine enforcing dual physical arming environments (setback G-switch + spin sensor) with safe-separation timer and dud-prevention fail-safes.
- **Parallelized Monte Carlo Analysis:** Multi-process batch runner simulating 100+ to 1,000+ trajectory shots across stochastic environmental perturbations, computing CEP50, CEP90, range error, and deflection error.
- **Hardware Gateway & Fault Injection:** Real-time telemetry receiver handling binary packets with CRC verification, supporting dynamic fault injection (sensor drift, GNSS loss, canard stall, battery sag).
- **Tactical Ground Station Interface:** Fully offline-capable dark-theme operational dashboard featuring:
  - 3D interactive ballistic trajectory arc rendered on CesiumJS digital globe.
  - Interactive Three.js 3D model of the 155mm shell with steerable canards.
  - Plotly 2D/3D dispersion point cloud visualizations.
  - Real-time telemetry gauge readouts, power drain curves, and KaTeX mathematical formulas.
  - Automated mission audit and compliance report generator.
- **Enterprise-Grade Backend:** FastAPI architecture with Alembic migrations, SQLite persistence, JWT authentication, SHA-256 provenance hashing for reproducible simulation replays, and audit trail logging.

---

## System Architecture

```
                                  +---------------------------------------+
                                  |     AEGIS-155 Ground Station UI       |
                                  |  (CesiumJS / Three.js / Plotly / KaTeX)|
                                  +-------------------+-------------------+
                                                      | HTTP / REST
                                                      v
+----------------------------------------------------------------------------------------------------+
|                                    FastAPI Application Server                                      |
|                                                                                                    |
|  [ Auth & Security ]   [ Simulation Engine ]   [ Telemetry Gateway ]   [ BOM & Power Systems ]     |
|   JWT / RBAC Guards     Monte Carlo Runner      Fault Injection Matrix  Battery Discharge Curves   |
+-----------------------------------+-----------------------------------+----------------------------+
                                    |                                   |
         +--------------------------+--------+                +---------+-------------------+
         |                                   |                |                             |
         v                                   v                v                             v
+------------------+              +--------------------+  +----------------------+  +----------------+
|  physics.py      |              |  esad.py           |  |  database.py         |  | hardware_      |
|  - 6-DOF MPM     |              |  - MIL-STD-1316    |  |  - SQLAlchemy ORM    |  | gateway.py     |
|  - Mach Drag     |              |  - Dual Arming     |  |  - Alembic Schema    |  | - Packet Parse |
|  - Magnus/Coriolis              |  - HV Isolation    |  |  - Replay Provenance |  | - CRC Check    |
|  - EKF GNSS/INS  |              |  - Safe Separation |  |  - Audit Log Trail   |  | - Sensor Biases|
+------------------+              +--------------------+  +----------------------+  +----------------+
```

---

### 1. 6-DOF Exterior Ballistics & Aerodynamics Engine

The core ballistics module (`physics.py`) provides the authoritative physical and mathematical truth for projectile flight dynamics.

#### Primary Aerodynamic & Environmental Forces Modeled:
1. **Aerodynamic Drag:**
   $$\vec{F}_{\text{drag}} = -\frac{1}{2} \rho(y) \, v_{\text{rel}} \, S \, C_D(M) \, \vec{v}_{\text{rel}}$$
   Where $C_D(M)$ is dynamically evaluated against transonic and supersonic Mach tables ($M \in [0.4, 3.0]$), and $\rho(y)$ is calculated using the US Standard Atmosphere 1976 barometric model.

2. **Magnus Force:**
   Accounts for cross-axis lift generated by the high spin rate (~250-300 Hz) imparted by the rifled barrel:
   $$\vec{F}_{\text{Magnus}} = \frac{1}{2} \rho(y) \, S \, d \, C_{mag} \, (\vec{\omega} \times \vec{v}_{\text{rel}})$$

3. **Geodesic & Earth-Relative Effects:**
   Includes both latitude-dependent Coriolis acceleration and gravity variation:
   $$\vec{a}_{\text{Coriolis}} = -2 \, (\vec{\Omega}_{\text{Earth}} \times \vec{v})$$

---

### 2. Guidance, Navigation & Control (GNC)

- **Canard Actuation Assembly (CAA):** The front guidance section features 4 aerodynamic canards mounted on a rotating sleeve that is decoupled from the main shell body via high-speed bearings. Canard deflection adjusts both pitch and yaw trim angles.
- **Roll De-Spin Control:** Employs counter-torque aerofoil control to nullify spin on the guidance section, allowing standard commercial-grade IMU sensors to operate without saturation.
- **Hybrid Navigation (EKF):**
  - **Sensors:** 3-axis high-G accelerometers, 3-axis rate gyros, barometric altimeter, and multi-GNSS receiver.
  - **State Vector:** Position $(x, y, z)$, Velocity $(v_x, v_y, v_z)$, Attitude quaternions, and sensor bias estimates.
  - **Extended Kalman Filter:** Corrects dead-reckoned INS drift whenever GNSS pseudo-range measurements are acquired, with covariance propagation accounting for satellite constellation dilution of precision (GDOP).

---

### 3. Electronic Safe, Arm, and Detonate (ESAD) Architecture

Safety compliance is implemented in `esad.py` following **MIL-STD-1316** and **STANAG 4187**:

1. **Safe Separation Logic:** project initiation requires two independent physical flight environments before arming energy can be transferred to the firing capacitor:
   - **Environment 1 (Setback):** Axial launch acceleration exceeding $+15,000 \text{ G}$ detected by a dedicated mechanical setback switch.
   - **Environment 2 (Spin / Dynamic Flight):** Continuous sustained barrel spin followed by exit muzzle verification.
2. **Arming Sequence:** Firing capacitor charging begins only after passing a minimum safe separation distance (minimum 500 meters downrange / 5 seconds flight time).
3. **Fail-Safe Dudding:** If trajectory deviation exceeds permissible limits, or if guidance loses attitude authority, the system safely bleeds capacitor energy through a high-impedance drain resistor to prevent unintended collateral detonation.

---

### 4. Multi-Mode Smart Fuze Capabilities

The system supports four selectable fuze trigger modes:
- **Point Detonating (PD / Impact):** Direct impact switch trigger upon surface collision.
- **Delay (Hardened Target / Bunker Penetration):** Programmable millisecond delay ($0-100\text{ ms}$) following initial deceleration shock to enable penetration before detonation.
- **Proximity (Airburst):** FMCW radar altimeter triggered at a configurable Height of Burst (typically $9-12\text{ meters AGL}$) to maximize lethal fragment distribution against entrenched targets.
- **Time (Electronic Airburst):** High-precision digital timer countdown initiated at gun-fire.

---

### 5. Monte Carlo Statistical Dispersion Engine

To validate system efficacy, `physics.py` includes a parallelized Monte Carlo dispersion processor (`ProcessPoolExecutor`):
- Runs batch simulations with user-defined sample counts (e.g., $N = 100$ to $N = 1,000$).
- Injects independent Gaussian variance into:
  - Muzzle velocity ($\sigma_{v} = 3.5\text{ m/s}$)
  - Elevation and azimuth quadrant laying errors ($\sigma_{\theta} = 0.5\text{ mils}$)
  - Crosswind and headwind speed gradients ($\sigma_{w} = 2.0\text{ m/s}$)
- Generates side-by-side comparisons of unguided ballistic spread vs. PGK-guided impacts.
- Computes **CEP50** (50% probability radius) and **CEP90** with statistical confidence bounds.

---

### 6. Systems Engineering: Bill of Materials & Power Budget

- **BOM Breakdown (`config/bom_config.py`):** Structured hierarchical cost analysis across Canard Actuation Assembly, Guidance & Sensor Core, ESAD Module, Structural Housing (7075-T6 Aerospace Aluminum), and Thermal Battery.
- **Power Budget & Battery Modeling (`config/power_config.py`):**
  - Primary Power: High-density molten-salt thermal battery activated upon setback shock.
  - Peak Current Draw: 4.8A during maximum canard deflection slew rate.
  - Discharge Curve: Simulates voltage drop across nominal 60-120 second flight profiles.

---

## Offline-First Tactical Ground Station UI

The web-based tactical dashboard (`static/index.html`) operates 100% offline without requiring external internet connectivity:

| Technology | Purpose |
| :--- | :--- |
| **CesiumJS** | Real-time 3D ballistic trajectory rendering on a digital Earth globe with altitude profiles. |
| **Three.js** | Interactive 3D mechanical model of the 155mm shell with rotatable canards and wireframe inspection. |
| **Plotly.js** | High-performance interactive 2D and 3D scatter plots for Monte Carlo impact dispersion analysis. |
| **KaTeX** | Real-time mathematical equation formatting for ballistics and physics equations. |
| **GSAP & ScrollTrigger** | Hardware-accelerated UI transitions and tactical panel animations. |
| **Report Generator** | Client-side export of comprehensive ballistic verification and mission certification reports. |

---

## REST API Reference & Data Contracts

All endpoints are built with FastAPI and documented via interactive Swagger UI (`/docs`).

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/jobs` | Execute single or Monte Carlo ballistic simulation run. |
| `GET` | `/api/jobs/latest` | Retrieve latest executed job results and trajectory points. |
| `POST` | `/api/jobs/{id}/replay` | Deterministically replay a simulation using stored parameter snapshot and SHA-256 hash. |
| `GET` | `/api/telemetry/latest` | Poll latest telemetry packet from hardware gateway. |
| `POST` | `/api/telemetry` | Ingest real-time telemetry stream from hardware or simulator. |
| `GET` | `/api/faults` | Retrieve active hardware fault injection matrix. |
| `POST` | `/api/faults` | Inject hardware faults (e.g., IMU bias, canard freeze, low voltage). |
| `GET` | `/api/bom` | Query engineering Bill of Materials with unit costs and weights. |
| `GET` | `/api/power` | Fetch power consumption profile and battery discharge models. |
| `GET` | `/api/health` | Infrastructure health check for monitoring and container orchestration. |

---

## Hardware Telemetry Gateway & Fault Injection

The gateway module (`hardware_gateway.py`) enables real-time interaction with physical or simulated fuze electronics:
- **Packet Validation:** Enforces strict packet framing, sequence counters, and CRC32 checksums.
- **Telemetry Simulator (`tools/telemetry_simulator.py`):** Deterministic tool generating high-rate telemetry packets:
  ```bash
  python tools/telemetry_simulator.py --mode DEGRADED --rate 10
  ```
- **Supported Fault Modes:**
  - `NORMAL`: Nominal telemetry within baseline bounds.
  - `DEGRADED`: Voltage sag under high aerodynamic load.
  - `SENSOR_FAULT`: IMU accelerometer/gyro saturation.
  - `NAVIGATION_DEGRADED`: Simulated GNSS denial with INS gyro drift.

---

## Verification & Testing

The repository contains an automated test suite verifying mathematical models, ESAD logic, API schemas, and security guards.

### Running the Test Suite
```bash
# Run all unit and integration tests (in development mode)
pytest -v
```

### Running Auth-Enforced Security Tests
```bash
# Windows PowerShell
$env:AUTH_ENABLED="True"; $env:DEMO_MODE="true"; pytest -m auth -v

# Linux / macOS
AUTH_ENABLED=True DEMO_MODE=true pytest -m auth -v
```

### Test Coverage Highlights:
- `tests/test_physics.py`: Validates 6-DOF trajectory integration, drag tables, and energy conservation.
- `tests/test_esad.py`: Verifies two-environment arming logic, premature trigger lockouts, and capacitor drain.
- `tests/test_monte_carlo.py`: Tests dispersion statistics, random seed determinism, and CEP calculation.
- `tests/test_api.py`: Validates FastAPI contracts, request validation, and response schemas.
- `tests/test_auth_guards.py`: Verifies production security constraints and environment safety guards.

---

## Getting Started & Local Deployment

### Prerequisites
- **Python 3.11.x** (Target platform defined in `.python-version`)
- **pip** package manager
- Optional: **Docker** for containerized execution

### Quickstart (Windows / Linux / macOS)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Lakshyagupta23/SIH-26098-pgk-artillery.git
   cd SIH-26098-pgk-artillery
   ```

2. **Set up Python Virtual Environment:**
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux / macOS:
   source venv/bin/activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the Application:**
   - **Windows:** Double-click `start.bat` or run:
     ```powershell
     .\start.bat
     ```
   - **Linux / macOS:** Make executable and run:
     ```bash
     chmod +x start.sh
     ./start.sh
     ```

5. **Open the Ground Station Dashboard:**
   Open your browser and navigate to:
   - Dashboard: `http://localhost:8000`
   - Interactive Swagger API Documentation: `http://localhost:8000/docs`

---

### Docker Container Deployment

For production deployments or consistent sandboxed evaluation:

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```

2. **Build the Container Image:**
   ```bash
   docker build -t aegis155-backend .
   ```

3. **Run the Container:**
   ```bash
   docker run -d \
     --name aegis155 \
     -p 8000:8000 \
     -v "$(pwd)/aegis155.db:/app/aegis155.db" \
     --env-file .env \
     aegis155-backend
   ```

4. **Verify Container Health:**
   ```bash
   curl -f http://localhost:8000/api/health
   ```

---

## Environment Configuration

Configuration is managed via `.env` (derived from `.env.example`):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | Runtime mode (`development` or `production`). |
| `PORT` | `8000` | Port for the Uvicorn web server. |
| `AUTH_ENABLED` | `False` | Toggles JWT authentication requirement. Must be `True` in production. |
| `SECRET_KEY` | *(placeholder)* | Cryptographic key for signing JWT tokens (min 32 characters in prod). |
| `CESIUM_ION_TOKEN` | *(optional)* | Cesium ion access token for high-resolution 3D terrain and satellite imagery. |
| `CORS_ORIGINS` | `http://localhost:8000` | Comma-separated list of permitted CORS origins. |

---

## Repository Structure

```
SIH-26098-pgk-artillery/
├── api/                       # FastAPI application layer
│   ├── routers/               # Modular REST route controllers
│   ├── schemas.py             # Pydantic request and response schemas
│   └── security.py            # JWT authentication and security guards
├── config/                    # Systems engineering configurations
│   ├── bom_config.py          # Bill of Materials and subsystem weights/costs
│   ├── hardware_config.py     # Canard geometry, IMU, and actuator bounds
│   ├── power_config.py        # Thermal battery discharge and power models
│   └── simulation_config.py   # Ballistic integration timesteps and parameters
├── static/                    # Offline-first tactical mission control UI
│   ├── index.html             # Tactical dashboard single-page application
│   ├── styles.css             # Low-light tactical stylesheet
│   ├── js/                    # Modular ES6 dashboard modules (Cesium, Three, Plotly)
│   └── vendor/                # Self-hosted offline assets (Three.js, KaTeX, GSAP)
├── tests/                     # Automated pytest verification suite
│   ├── test_api.py            # API integration tests
│   ├── test_auth_guards.py    # Production safety configuration tests
│   ├── test_esad.py           # MIL-STD-1316 ESAD logic tests
│   ├── test_monte_carlo.py    # Statistical dispersion tests
│   └── test_physics.py        # 6-DOF trajectory & aerodynamics validation
├── tools/                     # Operational developer and test utilities
│   └── telemetry_simulator.py # Hardware gateway packet generator
├── alembic/                   # Database migrations
├── database.py                # SQLAlchemy engine and session management
├── design.md                  # UI/UX engineering design specification
├── esad.py                    # MIL-STD-1316 ESAD state machine implementation
├── hardware_gateway.py        # Telemetry receiver and fault injection
├── main.py                    # Application entrypoint and lifecycle orchestration
├── models.py                  # SQLAlchemy database models (audit logs, runs, users)
├── physics.py                 # Authoritative 6-DOF exterior ballistics engine
├── Dockerfile                 # Multi-stage production container definition
├── requirements.txt           # Python package dependencies
├── start.bat                  # Windows launch script
└── start.sh                   # Linux/macOS launch script
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Developed for Smart India Hackathon (SIH) Problem Statement 26098.
