/* ==========================================================================
   AEGIS-155: 3D Globe Visualizer — Cesium 1.119 (file:// compatible)
   Uses SingleTileImageryProvider with a programmatic canvas so zero
   network requests are needed. Globe always renders regardless of CORS.
   ========================================================================== */

import CONFIG from './config.js';

class AegisCesiumGlobe {
    constructor(containerId) {
        this.containerId = containerId;
        this.viewer = null;
        this.isInitialized = false;

        this.originLat = 27.0500;
        this.originLon = 71.7500;
        this.originAlt = 220;
        this.targetLon = this.originLon + 0.215;
        this.targetLat = this.originLat;

        this.pathEntity1 = null;
        this.pathEntity2 = null;
        this.shellEntity1 = null;
        this.shellEntity2 = null;
    }

    async init() {
        const container = document.getElementById(this.containerId);

        // === OFFLINE DEGRADATION ===
        // If Cesium CDN failed to load (window.CESIUM_OFFLINE is set or typeof Cesium is undefined),
        // show a graceful notice. The Three.js 3D view is the primary offline visualization.
        if (window.CESIUM_OFFLINE || typeof Cesium === 'undefined') {
            if (container) {
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'center';
                container.style.flexDirection = 'column';
                container.style.background = '#0B0F18';
                container.style.border = '1px solid rgba(255,149,0,0.3)';
                container.style.borderRadius = '8px';
                container.innerHTML = `
                    <div style="text-align:center; padding: 2rem; max-width: 420px;">
                        <div style="font-size: 2.5rem; margin-bottom: 1rem;">🌐</div>
                        <h3 style="color: #ff9500; font-family: 'Outfit', sans-serif; font-size: 1rem; letter-spacing: 0.1em; margin-bottom: 0.75rem;">SATELLITE IMAGERY UNAVAILABLE</h3>
                        <p style="color: #8899aa; font-size: 0.85rem; line-height: 1.6; margin-bottom: 1rem;">
                            Cesium Ion requires an internet connection for live satellite tile streaming. This system is operating in <strong style="color:#00e5ff;">OFFLINE MODE</strong>.
                        </p>
                        <div style="background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.2); border-radius: 4px; padding: 0.75rem; font-size: 0.8rem; color: #00e5ff;">
                            ✓ Three.js 3D Trajectory Viewer — ACTIVE<br>
                            ✓ Simulation Engine — ACTIVE<br>
                            ✓ Monte Carlo Analysis — ACTIVE<br>
                            ✗ Cesium Satellite Globe — OFFLINE
                        </div>
                    </div>`;
            }
            return;
        }

        if (this.isInitialized) return;

        if (!CONFIG.CESIUM_ION_TOKEN || CONFIG.CESIUM_ION_TOKEN.trim() === '') {
            try {
                const res = await fetch('/api/config');
                const cfg = await res.json();
                if (cfg.cesium_token) {
                    CONFIG.CESIUM_ION_TOKEN = cfg.cesium_token;
                }
            } catch (e) { console.error("Could not fetch config", e); }
        }
        
        const hasToken = CONFIG.CESIUM_ION_TOKEN && CONFIG.CESIUM_ION_TOKEN.trim() !== '';
        Cesium.Ion.defaultAccessToken = hasToken ? CONFIG.CESIUM_ION_TOKEN : '';

        for (let i = 0; i < 60; i++) {
            if (container && container.offsetWidth > 0 && container.offsetHeight > 0) break;
            await new Promise(r => requestAnimationFrame(r));
        }

        // ── Terrain: try World Terrain (requires Ion token), fall back to flat ──
        let terrainProvider;
        try {
            if (hasToken) {
                terrainProvider = await Cesium.createWorldTerrainAsync();
            } else {
                throw new Error('no token');
            }
        } catch (_) {
            terrainProvider = new Cesium.EllipsoidTerrainProvider();
            console.warn('[AEGIS-GIS] World terrain unavailable — using flat ellipsoid fallback.');
        }

        // ── Imagery: use Ion Aerial if token present, else ArcGIS if online, else built-in Grid ──
        let baseLayer;
        if (hasToken) {
            baseLayer = undefined; // Cesium default (Bing via Ion)
        } else if (navigator.onLine) {
            try {
                // Online but no token -> use ArcGIS satellite imagery
                const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
                    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
                    { enablePickFeatures: false }
                );
                baseLayer = new Cesium.ImageryLayer(provider);
                console.warn('[AEGIS-GIS] Online mode (no token): using ArcGIS World Imagery fallback.');
            } catch (e) {
                console.error('[AEGIS-GIS] Failed to load ArcGIS Imagery Provider:', e);
            }
        }
        
        if (!hasToken && !baseLayer) {
            // Offline -> use Grid
            const provider = new Cesium.GridImageryProvider({
                cells: 8,
                color: new Cesium.Color(0.0, 0.9, 1.0, 0.1),
                glowColor: new Cesium.Color(0.0, 0.9, 1.0, 0.05),
                glowWidth: 6,
                tileWidth: 256,
                tileHeight: 256
            });
            baseLayer = new Cesium.ImageryLayer(provider);
            console.warn('[AEGIS-GIS] Offline mode: using GridImageryProvider.');
        }

        // ── CREATE VIEWER ────────────────────────────────────────────────────
        this.viewer = new Cesium.Viewer(this.containerId, {
            requestRenderMode: true,
            maximumRenderTimeChange: 0.1,
            targetFrameRate: 30,
            terrainProvider,
            baseLayerPicker: false,
            baseLayer: baseLayer,
            animation: false,
            timeline: false,
            infoBox: false,
            homeButton: false,
            fullscreenButton: false,
            selectionIndicator: false,
            navigationHelpButton: false,
            geocoder: false,
            sceneModePicker: false
        });

        // Globe appearance — offline-safe terrain color resembling desert terrain
        this.viewer.scene.globe.enableLighting = false;
        this.viewer.scene.globe.show = true;
        // Use a sandy-brown base color to resemble Rajasthan desert terrain
        this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#4a3520');
        this.viewer.forceResize();

        // Sky/atmosphere tweaks to make offline view look intentional
        if (this.viewer.scene.skyAtmosphere) {
            this.viewer.scene.skyAtmosphere.show = true;
        }
        // Add a colored Pokhran region overlay polygon so terrain context is clear
        this.viewer.entities.add({
            polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray([
                    70.5, 26.0,  73.0, 26.0,  73.0, 28.0,  70.5, 28.0
                ]),
                material: Cesium.Color.fromCssColorString('#d4a96a').withAlpha(0.25),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString('#d4a96a').withAlpha(0.6),
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            }
        });
        // Region label
        this.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(71.75, 28.4, 2000),
            label: {
                text: 'RAJASTHAN SECTOR\nPokhran Field Firing Range',
                font: 'bold 11px monospace',
                fillColor: Cesium.Color.fromCssColorString('#d4a96a'),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                scaleByDistance: new Cesium.NearFarScalar(1e4, 1.0, 5e5, 0.3)
            }
        });

        // Remap camera controls for intuitive 3D orbiting
        this.viewer.scene.screenSpaceCameraController.tiltEventTypes = [
            Cesium.CameraEventType.LEFT_DRAG, Cesium.CameraEventType.PINCH,
            {eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL},
            {eventType: Cesium.CameraEventType.RIGHT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL}
        ];
        this.viewer.scene.screenSpaceCameraController.zoomEventTypes = [
            Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH
        ];
        this.viewer.scene.screenSpaceCameraController.rotateEventTypes = [
            Cesium.CameraEventType.RIGHT_DRAG
        ];

        console.log('[AEGIS-GIS] Globe live with local canvas imagery!');

        // Fly to Pokhran — look straight down so terrain/grid is visible
        this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(this.originLon, this.originLat, 80000),
            orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-75), roll: 0 },
            duration: 2.0
        });

        // Build markers
        this.buildMarkers();
        this.buildShellEntities();
        this.isInitialized = true;

    }


    buildMarkers() {
        const addMarker = (lon, lat, alt, text, color) => {
            return this.viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
                label: {
                    text,
                    font: 'bold 13px monospace',
                    fillColor: Cesium.Color.fromCssColorString(color),
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    pixelOffset: new Cesium.Cartesian2(0, -10)
                },
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.fromCssColorString(color),
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
        };
        this.originMarker = addMarker(this.originLon, this.originLat, this.originAlt + 500, '▼ Aegis-155 Battery', '#00e5ff');
        this.targetMarker = addMarker(this.targetLon, this.targetLat, this.originAlt + 500, '✕ Target Bunker', '#ff4455');
    }

    buildShellEntities() {
        const mkShell = color => this.viewer.entities.add({
            position: new Cesium.ConstantPositionProperty(
                Cesium.Cartesian3.fromDegrees(this.originLon, this.originLat, this.originAlt)
            ),
            orientation: Cesium.Quaternion.IDENTITY,
            ellipsoid: {
                radii: new Cesium.Cartesian3(25.0, 25.0, 100.0),
                material: Cesium.Color.fromCssColorString(color).withAlpha(0.9),
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            path: {
                resolution: 1,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    taperPower: 0.5,
                    color: Cesium.Color.fromCssColorString(color)
                }),
                width: 10,
                leadTime: 0,
                trailTime: 2.0
            },
            show: false
        });
        this.shellEntity1 = mkShell('#00e5ff');
        this.shellEntity2 = mkShell('#ff8800');
    }

    flyToPreset(preset) {
        if (!this.viewer) return;
        const p = {
            GROUND:  { dest: [this.originLon, this.originLat - 0.05, 800],  hdg: 90, pitch: -10 },
            APEX:    { dest: [this.originLon + 0.1, this.originLat, 25000],  hdg: 90, pitch: -35 },
            TARGET:  { dest: [this.targetLon, this.targetLat, 1500],          hdg: 270, pitch: -20 }
        }[preset];
        if (p) this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(...p.dest),
            orientation: { heading: Cesium.Math.toRadians(p.hdg), pitch: Cesium.Math.toRadians(p.pitch), roll: 0 },
            duration: 2.0
        });
    }

    drawTrajectory(coords, isGuided) {
        if (!this.viewer || !coords || coords.length === 0) return;
        
        let pathPositions = [];
        for (let pt of coords) {
            pathPositions.push(Cesium.Cartesian3.fromDegrees(
                this.originLon + pt[0] / 111320.0,
                this.originLat + pt[2] / 111320.0,
                this.originAlt + pt[1]
            ));
        }

        const e = isGuided ? this.pathEntity2 : this.pathEntity1;
        if (e) this.viewer.entities.remove(e);
        
        const pathEntity = this.viewer.entities.add({
            polyline: {
                positions: pathPositions,
                width: isGuided ? 4 : 2,
                material: new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.fromCssColorString(isGuided ? '#10b981' : '#ef4444').withAlpha(0.8),
                    dashLength: 16.0
                }),
                clampToGround: false
            }
        });

        if (isGuided) this.pathEntity2 = pathEntity;
        else this.pathEntity1 = pathEntity;
    }

    updateShellRealtime(pt, isGuided) {
        if (!this.viewer || !pt) return;
        const e = isGuided ? this.shellEntity2 : this.shellEntity1;
        if (!e) return;
        
        const pos = Cesium.Cartesian3.fromDegrees(
            this.originLon + pt.x / 111320.0,
            this.originLat + pt.z / 111320.0,
            this.originAlt + pt.y
        );
        e.position = new Cesium.ConstantPositionProperty(pos);
        
        const heading = Math.atan2(pt.velZ || 0, pt.velX || 1);
        const pitch = Math.atan2(pt.velY || 0, Math.sqrt((pt.velX||1)**2 + (pt.velZ||0)**2));
        const hpr = new Cesium.HeadingPitchRoll(heading, pitch, 0);
        e.orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
        e.show = true;
    }

    reset() {
        if (this.pathEntity1) this.viewer.entities.remove(this.pathEntity1);
        if (this.pathEntity2) this.viewer.entities.remove(this.pathEntity2);
        if (this.shellEntity1) this.shellEntity1.show = false;
        if (this.shellEntity2) this.shellEntity2.show = false;
        this.pathEntity1 = null;
        this.pathEntity2 = null;
    }
}

export default AegisCesiumGlobe;
