# Design Specification

## AEGIS-155: Precision Guidance Kit & Tactical Mission Control UI

### 1. Visual Hierarchy & Theme Architecture
The AEGIS-155 tactical dashboard utilizes a military-grade, low-light dark aesthetic engineered for high situational awareness, prolonged operator comfort, and high contrast during data readout.
- **Base Surfaces**: Multi-tiered obsidian and slate foundation (`#040608` to `#121820`) providing optical depth without glare.
- **Accent & Status Accents**: 
  - Muted Terracotta/Gold (`#B8862D`): Mission status, trajectory locks, and primary triggers.
  - Tactical Emerald (`#348A59`): Nominal subsystems, healthy telemetry, and ESAD arming confirmation.
  - Ballistic Cyan/Teal (`#4A8B9F`): Atmospheric and EKF state vectors.
  - Threat Amber / Red (`#E05D44`): Fuze fail-safes, sensor faults, and trajectory deviation warnings.
- **Borders & Framing**: Subdued high-precision gradient borders (1px hairline) to delineate critical sensor pods without visual clutter.
- **Glassmorphism**: Controlled frosted backdrop filtration (`backdrop-filter: blur(16px)`) applied to mission control cards for layered depth over 3D trajectory layers.

### 2. Typography & Readout Standards
- **Display & Section Headers**: *Space Grotesk* and *Outfit* provide ergonomic readability across command overview modules and structural breakdowns.
- **Tactical Data Readouts**: *JetBrains Mono* is standard for real-time telemetry tables, EKF covariance matrices, coordinates, and timestamp logs to preserve numeric column alignment.

### 3. Layout & Ergonomics
- **Proportional Geometry**: Employs an asymmetric multi-column command arrangement (22% / 1fr / 18%) balancing subsystem telemetry, centralized 3D trajectory rendering (CesiumJS/Three.js), and quick-action ballistics controls.
- **Micro-interactions**: Hardware-accelerated hover transitions, fluid card elevation shifts, and state updates designed to emulate physical avionics displays.
