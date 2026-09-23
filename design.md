# Design Specification (Design.md)
## AEGIS-155: Precision Guidance Kit UI

### 1. Visual Aesthetics
The user interface avoids generic AI-generated "Bento Grids" and standard component aesthetics.
- **Palette**: Deep slate/obsidian (`#040608` to `#121820`) backgrounds.
- **Accents**: Warm sand/terracotta (`#B8862D`), deep emerald (`#348A59`), and muted teal (`#4A8B9F`).
- **Borders**: Thin chrome/gold gradients instead of thick flat borders.
- **Glassmorphism**: Subtle, refined frosted glass (`backdrop-filter: blur(16px)`) applied sparingly to major panel cards, avoiding the overused "liquid glass" look.

### 2. Typography
- **Headings & Base Text**: *Space Grotesk* and *Outfit* (sans-serif) for premium readability and distinction from default AI-generated Inter/Geist fonts.
- **Data Readouts**: *JetBrains Mono* for telemetry to provide industrial/engineering authenticity without feeling cliché.

### 3. Layout Architecture
- **Fluid & Asymmetrical**: Uses custom `minmax` column proportions (e.g., 22% / 1fr / 18%) instead of strict 33/33/33 grids.
- **Micro-animations**: Smooth hover scaling, fluid box-shadow transitions, and element slide-ins (similar to React-Spring physics) used for interactivity on panels and buttons.

### 4. Directives Met
- High-quality, distinct presentation.
- No dot grids, pure white backgrounds, rainbow coloring, or overused soft-corner radiuses.
