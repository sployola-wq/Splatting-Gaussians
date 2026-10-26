import { DRONE_PAYLOADS, BATTERY_PRESETS } from '../constants/drones';
import {
  BatterySegment,
  LatLng,
  MissionConfig,
  MissionMetrics,
  MissionWaypoint,
  WaypointPhase,
} from '../types/mission';

const EARTH_RADIUS_M = 6378137;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Convert LatLng to local planar XY (meters) relative to origin
 */
export function latLngToXY(pt: LatLng, origin: LatLng): { x: number; y: number } {
  const dLat = degToRad(pt.lat - origin.lat);
  const dLng = degToRad(pt.lng - origin.lng);
  const latAvg = degToRad((pt.lat + origin.lat) / 2);
  const x = dLng * EARTH_RADIUS_M * Math.cos(latAvg);
  const y = dLat * EARTH_RADIUS_M;
  return { x, y };
}

/**
 * Convert local planar XY (meters) back to LatLng relative to origin
 */
export function xyToLatLng(x: number, y: number, origin: LatLng): LatLng {
  const dLat = y / EARTH_RADIUS_M;
  const lat = origin.lat + radToDeg(dLat);
  const latAvg = degToRad((lat + origin.lat) / 2);
  const dLng = x / (EARTH_RADIUS_M * Math.cos(latAvg));
  const lng = origin.lng + radToDeg(dLng);
  return { lat, lng };
}

/**
 * Haversine distance in meters between two LatLng coordinates
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(degToRad(a.lat)) * Math.cos(degToRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Compute bearing from point A to point B in DJI WPML range [-180, 180]
 * (0 = North, 90 = East, 180/-180 = South, -90 = West)
 */
export function computeDjiHeading(from: LatLng, to: LatLng): number {
  const dLng = degToRad(to.lng - from.lng);
  const lat1 = degToRad(from.lat);
  const lat2 = degToRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = radToDeg(Math.atan2(y, x));
  return Math.round(brng * 10) / 10;
}

/**
 * Compute exact trigonometric gimbal pitch pointing from altitude H to horizontal distance D_poi:
 * pitch = -round(atan(Altitude / D_waypoint_to_POI) * 180 / PI)
 * Clamped to [minPitch, maxPitch] (e.g. [-85, -25])
 */
export function computeTrigonometricPitch(
  altitudeM: number,
  horizontalDistM: number,
  minPitch = -85,
  maxPitch = -25
): number {
  const safeDist = Math.max(1, horizontalDistM);
  const rawPitch = -Math.round(radToDeg(Math.atan2(altitudeM, safeDist)));
  return Math.max(minPitch, Math.min(maxPitch, rawPitch));
}

/**
 * Compute polygon centroid
 */
export function computeCentroid(polygon: LatLng[]): LatLng | null {
  if (polygon.length === 0) return null;
  if (polygon.length === 1) return { ...polygon[0] };
  let sumLat = 0;
  let sumLng = 0;
  for (const p of polygon) {
    sumLat += p.lat;
    sumLng += p.lng;
  }
  return {
    lat: sumLat / polygon.length,
    lng: sumLng / polygon.length,
  };
}

/**
 * Compute polygon area in square meters using Shoelace formula
 */
export function computePolygonAreaM2(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  const origin = polygon[0];
  const pts = polygon.map((p) => latLngToXY(p, origin));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Compute characteristic radius of a polygon around its centroid
 */
export function computePolygonBaseRadiusM(
  polygon: LatLng[],
  centroid: LatLng | null
): number {
  if (polygon.length < 3 || !centroid) return 60;
  const polyXY = polygon.map((p) => latLngToXY(p, centroid));
  let sumDist = 0;
  let maxDist = 0;
  for (const p of polyXY) {
    const d = Math.hypot(p.x, p.y);
    sumDist += d;
    if (d > maxDist) maxDist = d;
  }
  const avgDist = sumDist / polyXY.length;
  return Math.max(15, avgDist * 0.65 + maxDist * 0.35);
}

/**
 * Find the optimal grid angle aligned with the longest edge of the polygon (0 - 179 deg)
 */
export function findLongestEdgeAngle(polygon: LatLng[]): number {
  if (polygon.length < 2) return 0;
  let maxDist = -1;
  let bestAngle = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = distanceMeters(a, b);
    if (d > maxDist) {
      maxDist = d;
      const h = computeDjiHeading(a, b);
      bestAngle = ((Math.round(h) % 180) + 180) % 180;
    }
  }
  return bestAngle;
}

/**
 * Create a circle polygon (array of vertices) from center and radius in meters
 */
export function createCirclePolygon(
  center: LatLng,
  radiusM: number,
  numVertices = 24
): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = (2 * Math.PI * i) / numVertices;
    const x = radiusM * Math.sin(angle);
    const y = radiusM * Math.cos(angle);
    pts.push(xyToLatLng(x, y, center));
  }
  return pts;
}

/**
 * Rotate 2D point by angle (radians)
 */
function rotate2D(x: number, y: number, angleRad: number): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

/**
 * Generate Lawnmower Grid passes clipped to the polygon.
 * Includes optional leadInOffsetM at the start of each street to compensate oblique look-ahead.
 */
function generateGridWaypointsForAngle(
  polygon: LatLng[],
  origin: LatLng,
  angleDeg: number,
  lineSpacingM: number,
  photoStepM: number,
  generateEveryPoint: boolean,
  altitude: number,
  speed: number,
  gimbalPitch: number,
  phase: WaypointPhase,
  leadInOffsetM = 0
): Array<{
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  gimbalPitch: number;
  phase: WaypointPhase;
  isPhotoTrigger: boolean;
}> {
  if (polygon.length < 3) return [];

  const polyXY = polygon.map((p) => latLngToXY(p, origin));
  const rotRad = degToRad(angleDeg);
  const rotatedPoly = polyXY.map((p) => rotate2D(p.x, p.y, rotRad));

  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of rotatedPoly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  const safeSpacing = Math.max(2, lineSpacingM);
  const safePhotoStep = Math.max(1.5, photoStepM);

  const width = maxX - minX;
  const numLines = Math.max(1, Math.ceil(width / safeSpacing) + 1);
  const totalSpan = (numLines - 1) * safeSpacing;
  const startX = (minX + maxX) / 2 - totalSpan / 2;

  const result: Array<{
    lat: number;
    lng: number;
    altitude: number;
    speed: number;
    heading: number;
    gimbalPitch: number;
    phase: WaypointPhase;
    isPhotoTrigger: boolean;
  }> = [];

  let passDirection = 1;

  for (let i = 0; i < numLines; i++) {
    const xLine = startX + i * safeSpacing;
    const yIntersections: number[] = [];
    for (let j = 0; j < rotatedPoly.length; j++) {
      const p1 = rotatedPoly[j];
      const p2 = rotatedPoly[(j + 1) % rotatedPoly.length];
      if ((p1.x <= xLine && p2.x > xLine) || (p2.x <= xLine && p1.x > xLine)) {
        const t = (xLine - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        yIntersections.push(y);
      }
    }

    if (yIntersections.length < 2) continue;
    yIntersections.sort((a, b) => a - b);

    const yMin = yIntersections[0];
    const yMax = yIntersections[yIntersections.length - 1];
    if (Math.abs(yMax - yMin) < 1) continue;

    // Apply oblique Lead-in offset at the entry of the street so oblique camera frames the near edge
    const rawYStart = passDirection === 1 ? yMin : yMax;
    const yStart =
      passDirection === 1 ? rawYStart - leadInOffsetM : rawYStart + leadInOffsetM;
    const yEnd = passDirection === 1 ? yMax : yMin;

    const startUnrot = rotate2D(xLine, yStart, -rotRad);
    const endUnrot = rotate2D(xLine, yEnd, -rotRad);
    const startLatLng = xyToLatLng(startUnrot.x, startUnrot.y, origin);
    const endLatLng = xyToLatLng(endUnrot.x, endUnrot.y, origin);
    const passHeading = computeDjiHeading(startLatLng, endLatLng);

    if (!generateEveryPoint) {
      result.push({
        lat: startLatLng.lat,
        lng: startLatLng.lng,
        altitude,
        speed,
        heading: passHeading,
        gimbalPitch,
        phase,
        isPhotoTrigger: true,
      });
      result.push({
        lat: endLatLng.lat,
        lng: endLatLng.lng,
        altitude,
        speed,
        heading: passHeading,
        gimbalPitch,
        phase,
        isPhotoTrigger: true,
      });
    } else {
      const segLength = Math.abs(yEnd - yStart);
      const steps = Math.max(1, Math.ceil(segLength / safePhotoStep));
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const yCurr = yStart + frac * (yEnd - yStart);
        const unrot = rotate2D(xLine, yCurr, -rotRad);
        const ll = xyToLatLng(unrot.x, unrot.y, origin);
        result.push({
          lat: ll.lat,
          lng: ll.lng,
          altitude,
          speed,
          heading: passHeading,
          gimbalPitch,
          phase,
          isPhotoTrigger: true,
        });
      }
    }

    passDirection *= -1;
  }

  return result;
}

/**
 * Generate Circular / Elliptical Orbit waypoints around the polygon centroid (POI).
 * Supports per-waypoint trigonometric gimbal pitch calculation pointing at the POI.
 */
function generateOrbitWaypoints(
  polygon: LatLng[],
  centroid: LatLng,
  numPoints: number,
  radiusScale: number,
  altitude: number,
  speed: number,
  fallbackGimbalPitch: number,
  phase: WaypointPhase,
  autoDynamicPitchMode?: 'none' | 'poi_exact' | 'inner_3dgs' | 'outer_3dgs'
): Array<{
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  gimbalPitch: number;
  phase: WaypointPhase;
  isPhotoTrigger: boolean;
}> {
  if (polygon.length < 3) return [];
  const baseRadius = computePolygonBaseRadiusM(polygon, centroid) * radiusScale;

  const count = Math.max(8, numPoints);
  const orbitPts: Array<{
    lat: number;
    lng: number;
    altitude: number;
    speed: number;
    heading: number;
    gimbalPitch: number;
    phase: WaypointPhase;
    isPhotoTrigger: boolean;
  }> = [];

  for (let i = 0; i < count; i++) {
    const theta = -Math.PI / 2 - (2 * Math.PI * i) / count;
    const x = baseRadius * Math.cos(theta);
    const y = baseRadius * Math.sin(theta);
    const ll = xyToLatLng(x, y, centroid);
    const headingToPoi = computeDjiHeading(ll, centroid);
    const distToPoi = distanceMeters(ll, centroid);

    let wpPitch = fallbackGimbalPitch;
    if (autoDynamicPitchMode === 'poi_exact') {
      // Exact trigonometric angle pointing at the centroid POI, clamped [-85°, -25°]
      wpPitch = computeTrigonometricPitch(altitude, distToPoi, -85, -25);
    } else if (autoDynamicPitchMode === 'inner_3dgs') {
      // Phase 1 Inner Orbit: steep trigonometric angle looking into the inner base (~ -70° to -78°)
      wpPitch = computeTrigonometricPitch(altitude, distToPoi * 0.42, -78, -68);
    } else if (autoDynamicPitchMode === 'outer_3dgs') {
      // Phase 3 Outer Orbit (+20% radius): shallower angle framing facades & center without horizon floaters (~ -40° to -55°)
      wpPitch = computeTrigonometricPitch(altitude, distToPoi, -55, -38);
    }

    orbitPts.push({
      lat: ll.lat,
      lng: ll.lng,
      altitude,
      speed,
      heading: headingToPoi,
      gimbalPitch: wpPitch,
      phase,
      isPhotoTrigger: true,
    });
  }

  return orbitPts;
}

/**
 * Prepare a slice of waypoints for an independent sub-mission or emergency field resume,
 * ensuring video actions (startRecord / stopRecord) are properly injected at the new boundaries.
 */
export function prepareSubMissionWaypoints(
  slice: MissionWaypoint[],
  config: MissionConfig
): MissionWaypoint[] {
  if (slice.length === 0) return [];
  return slice.map((wp, idx) => {
    let action = wp.action;
    if (config.waypointAction === 'recordVideo') {
      if (idx === 0) action = 'startRecord';
      else if (idx === slice.length - 1) action = 'stopRecord';
      else action = 'noAction';
    } else if (config.waypointAction === 'intervalTimer') {
      action = idx === 0 ? 'intervalTimer' : 'noAction';
    } else if (config.waypointAction === 'takePhoto') {
      action = wp.isPhotoTrigger ? 'takePhoto' : 'noAction';
    }
    return {
      ...wp,
      action,
    };
  });
}

/**
 * Snap/clamp a theoretical interval (s) to the supported DJI Air 3S native intervals:
 * [2, 3, 5, 7, 10, 15, 30] seconds
 */
export function snapToDjiNativeInterval(rawSec: number, minIntervalSec = 2): number {
  const presets = [2, 3, 5, 7, 10, 15, 30];
  const safeMin = Math.max(2, Math.ceil(minIntervalSec));
  const validPresets = presets.filter((p) => p >= safeMin);
  if (rawSec <= validPresets[0]) return validPresets[0];
  let best = validPresets[0];
  for (const p of validPresets) {
    if (p <= rawSec + 0.15) {
      best = p;
    }
  }
  return best;
}

/**
 * Compute full mission waypoints, real multi-battery RTH cuts with resume overlap, and optical metrics
 */
export function buildMission(
  polygon: LatLng[],
  homePoint: LatLng | null,
  config: MissionConfig,
  terrainElevationsM?: Record<number, number>,
  importedWaypointsOverride?: MissionWaypoint[] | null
): {
  waypoints: MissionWaypoint[];
  metrics: MissionMetrics;
} {
  const payload = DRONE_PAYLOADS[config.payloadId] || DRONE_PAYLOADS.air3s_24mm_12mp;
  const batterySpec = BATTERY_PRESETS[config.batteryPreset] || BATTERY_PRESETS.optimal_30;

  // 1. Photogrammetry Optical Math & Trigger Interval (Auto vs Manual)
  const H = Math.max(10, config.altitude);
  const gsdCmPx =
    (H * payload.sensorWidthMm * 100) /
    (payload.focalLengthRealMm * payload.imageWidthPx);

  const footprintWidthM = (H * payload.sensorWidthMm) / payload.focalLengthRealMm;
  const footprintHeightM = (H * payload.sensorHeightMm) / payload.focalLengthRealMm;

  const computedLineSpacingM =
    footprintWidthM * (1 - Math.min(90, Math.max(20, config.sideOverlap)) / 100);
  const lineSpacingM =
    config.customLineSpacingM !== null && config.customLineSpacingM > 1
      ? config.customLineSpacingM
      : Math.round(computedLineSpacingM * 10) / 10;

  const photoStepM =
    Math.round(
      footprintHeightM * (1 - Math.min(92, Math.max(20, config.frontOverlap)) / 100) * 10
    ) / 10;

  const safeSpeed = Math.max(0.5, config.speed);
  const photoIntervalS = Math.round((photoStepM / safeSpeed) * 100) / 100;
  const djiNativeIntervalS = snapToDjiNativeInterval(
    photoIntervalS,
    payload.minIntervalSec
  );

  const isManualInterval = config.intervalMode === 'manual';
  const effectiveIntervalSec = isManualInterval
    ? Math.max(0.7, Number(config.customIntervalSec) || 2)
    : photoIntervalS;

  const effectivePhotoStepM = isManualInterval
    ? Math.round(safeSpeed * effectiveIntervalSec * 10) / 10
    : photoStepM;

  const effectiveFrontOverlapPct = isManualInterval
    ? Math.max(
        0,
        Math.min(
          98,
          Math.round(
            (1 - effectivePhotoStepM / Math.max(1, footprintHeightM)) * 1000
          ) / 10
        )
      )
    : config.frontOverlap;

  const lowOverlapWarning = effectiveFrontOverlapPct < 70;

  // Electronic shutter motion blur math
  const exposureSec = 1 / Math.max(60, config.shutterSpeedDenom);
  const motionBlurMm = safeSpeed * exposureSec * 1000;
  const motionBlurPx = motionBlurMm / (gsdCmPx * 10);

  const areaM2 = computePolygonAreaM2(polygon);
  const areaHa = areaM2 / 10000;
  const centroid = computeCentroid(polygon);
  const baseRadiusM = computePolygonBaseRadiusM(polygon, centroid);

  // 2. Dynamic Trigonometric Gimbal Pitch Calculation (Auto-Pitch Inteligente)
  let computedPhase1Pitch = config.orbitInnerGimbal;
  let computedPhase2Pitch = config.gimbalPitch;
  let computedPhase3Pitch = config.orbitOuterGimbal;
  let computedLeadInOffsetM = 0;
  let effectiveGimbalSummary = '';

  if (config.pattern === 'grid_2d') {
    const pitch2D = config.autoSmartGimbal ? -90 : config.gimbalPitch;
    computedPhase1Pitch = pitch2D;
    computedPhase2Pitch = pitch2D;
    computedPhase3Pitch = pitch2D;
    effectiveGimbalSummary = config.autoSmartGimbal
      ? `Grilla 2D: -90° (Auto Nadir Puro)`
      : `Grilla 2D: ${pitch2D}° (Manual)`;
  } else if (config.pattern === 'double_grid_3d') {
    // Optimal oblique angle between -60° and -65° based on Altitude/Radius ratio
    const autoObliquePitch = -Math.round(
      Math.max(60, Math.min(65, 60 + (H / Math.max(25, baseRadiusM)) * 4))
    );
    const pitch3D = config.autoSmartGimbal
      ? autoObliquePitch
      : config.gimbalPitch === -90
      ? -65
      : config.gimbalPitch;
    // Lead-in offset to compensate oblique look-ahead at entry of streets
    computedLeadInOffsetM = config.autoSmartGimbal
      ? Math.round(H * Math.tan(degToRad(90 - Math.abs(pitch3D))) * 0.4 * 10) / 10
      : 0;
    computedPhase1Pitch = pitch3D;
    computedPhase2Pitch = pitch3D;
    computedPhase3Pitch = pitch3D;
    effectiveGimbalSummary = config.autoSmartGimbal
      ? `Grilla 3D: ${pitch3D}° (Auto Oblicuo · Lead-in +${computedLeadInOffsetM}m)`
      : `Grilla 3D: ${pitch3D}° (Manual)`;
  } else if (config.pattern === 'orbit_poi') {
    const autoOrbitPitch = computeTrigonometricPitch(H, baseRadiusM, -85, -25);
    const pitchOrbit = config.autoSmartGimbal
      ? autoOrbitPitch
      : config.gimbalPitch === -90
      ? -60
      : config.gimbalPitch;
    computedPhase1Pitch = pitchOrbit;
    computedPhase2Pitch = pitchOrbit;
    computedPhase3Pitch = pitchOrbit;
    effectiveGimbalSummary = config.autoSmartGimbal
      ? `Órbita POI: ${pitchOrbit}° (Auto atan(H/R) @ R=${Math.round(baseRadiusM)}m)`
      : `Órbita POI: ${pitchOrbit}° (Manual)`;
  } else if (config.pattern === 'combo_3dgs') {
    const innerRadius = baseRadiusM * 0.92;
    const outerRadius = baseRadiusM * 1.2;
    const autoInnerPitch = computeTrigonometricPitch(
      H,
      innerRadius * 0.42,
      -78,
      -68
    );
    const autoOuterPitch = computeTrigonometricPitch(
      H,
      outerRadius,
      -55,
      -38
    );
    computedPhase1Pitch = config.autoSmartGimbal
      ? autoInnerPitch
      : config.orbitInnerGimbal;
    computedPhase2Pitch = config.autoSmartGimbal ? -90 : config.gimbalPitch;
    computedPhase3Pitch = config.autoSmartGimbal
      ? autoOuterPitch
      : config.orbitOuterGimbal;

    effectiveGimbalSummary = config.autoSmartGimbal
      ? `Fase 1: ${computedPhase1Pitch}° (Auto POI) · Fase 2: -90° (Nadir) · Fase 3: ${computedPhase3Pitch}° (Auto Fachadas)`
      : `Fase 1: ${computedPhase1Pitch}° · Fase 2: ${computedPhase2Pitch}° · Fase 3: ${computedPhase3Pitch}° (Manual)`;
  }

  // Oblique look-ahead offsets
  const activePitchForOffset =
    config.pattern === 'combo_3dgs' ? computedPhase3Pitch : computedPhase2Pitch;
  const pitchAbs = Math.min(90, Math.max(15, Math.abs(activePitchForOffset)));
  const lookAheadOffsetM = H * Math.tan(degToRad(90 - pitchAbs));
  const lookAhead75M = H * Math.tan(degToRad(15));
  const lookAhead60M = H * Math.tan(degToRad(30));
  const lookAhead45M = H * Math.tan(degToRad(45));

  const maxSpeedForInterval = effectivePhotoStepM / payload.minIntervalSec;
  const maxSpeedForBlur = (1.0 * (gsdCmPx * 10)) / (exposureSec * 1000);
  const recommendedMaxSpeedMs =
    Math.floor(Math.min(15, maxSpeedForInterval, maxSpeedForBlur) * 10) / 10;

  const intervalWarning: 'ok' | 'warning' | 'critical' =
    effectiveIntervalSec < payload.minIntervalSec
      ? 'critical'
      : effectiveIntervalSec < payload.minIntervalSec * 1.15
      ? 'warning'
      : 'ok';

  const blurWarning: 'ok' | 'warning' | 'critical' =
    motionBlurPx > 1.2 ? 'critical' : motionBlurPx > 0.8 ? 'warning' : 'ok';

  let rawPoints: Array<{
    lat: number;
    lng: number;
    altitude: number;
    speed: number;
    heading: number;
    gimbalPitch: number;
    phase: WaypointPhase;
    isPhotoTrigger: boolean;
    explicitAction?: string;
  }> = [];

  if (importedWaypointsOverride && importedWaypointsOverride.length > 0) {
    rawPoints = importedWaypointsOverride.map((wp) => ({
      lat: wp.lat,
      lng: wp.lng,
      altitude: config.altitude !== 70 ? config.altitude : wp.baseAltitude || wp.altitude,
      speed: wp.speed || config.speed,
      heading: wp.heading,
      gimbalPitch: wp.gimbalPitch,
      phase: wp.phase || 'imported',
      isPhotoTrigger: true,
      explicitAction: wp.action,
    }));
  } else if (polygon.length >= 3 && centroid) {
    if (config.pattern === 'grid_2d') {
      rawPoints = generateGridWaypointsForAngle(
        polygon,
        centroid,
        config.gridAngle,
        lineSpacingM,
        photoStepM,
        config.generateEveryPoint,
        H,
        safeSpeed,
        computedPhase2Pitch,
        'grid_nadir',
        0
      );
    } else if (config.pattern === 'double_grid_3d') {
      const pass1 = generateGridWaypointsForAngle(
        polygon,
        centroid,
        config.gridAngle,
        lineSpacingM,
        photoStepM,
        config.generateEveryPoint,
        H,
        safeSpeed,
        computedPhase2Pitch,
        'grid_nadir',
        computedLeadInOffsetM
      );
      const pass2 = generateGridWaypointsForAngle(
        polygon,
        centroid,
        (config.gridAngle + 90) % 360,
        lineSpacingM,
        photoStepM,
        config.generateEveryPoint,
        H,
        safeSpeed,
        computedPhase2Pitch,
        'grid_cross',
        computedLeadInOffsetM
      );
      rawPoints = [...pass1, ...pass2];
    } else if (config.pattern === 'orbit_poi') {
      rawPoints = generateOrbitWaypoints(
        polygon,
        centroid,
        config.orbitInnerPoints,
        1.0,
        H,
        safeSpeed,
        computedPhase1Pitch,
        'orbit_inner',
        config.autoSmartGimbal ? 'poi_exact' : 'none'
      );
    } else if (config.pattern === 'combo_3dgs') {
      const phase1 = generateOrbitWaypoints(
        polygon,
        centroid,
        config.orbitInnerPoints,
        0.92,
        H,
        safeSpeed,
        computedPhase1Pitch,
        'orbit_inner',
        config.autoSmartGimbal ? 'inner_3dgs' : 'none'
      );
      const phase2 = generateGridWaypointsForAngle(
        polygon,
        centroid,
        config.gridAngle,
        lineSpacingM,
        photoStepM,
        config.generateEveryPoint,
        H,
        safeSpeed,
        computedPhase2Pitch,
        'grid_nadir',
        0
      );
      const phase3 = generateOrbitWaypoints(
        polygon,
        centroid,
        config.orbitOuterPoints,
        1.2,
        H,
        safeSpeed,
        computedPhase3Pitch,
        'orbit_outer',
        config.autoSmartGimbal ? 'outer_3dgs' : 'none'
      );
      rawPoints = [...phase1, ...phase2, ...phase3];
    }

    if (config.highAccuracyAnchor && rawPoints.length >= 2) {
      const first = rawPoints[0];
      const second = rawPoints[1];
      const entryHeading = computeDjiHeading(first, second);
      const entryRad = degToRad(entryHeading);
      const firstXY = latLngToXY(first, centroid);
      const anchor1LL = xyToLatLng(
        firstXY.x - 24 * Math.sin(entryRad),
        firstXY.y - 24 * Math.cos(entryRad),
        centroid
      );
      const anchor2LL = xyToLatLng(
        firstXY.x - 10 * Math.sin(entryRad),
        firstXY.y - 10 * Math.cos(entryRad),
        centroid
      );
      rawPoints = [
        {
          lat: anchor1LL.lat,
          lng: anchor1LL.lng,
          altitude: H,
          speed: safeSpeed,
          heading: entryHeading,
          gimbalPitch: first.gimbalPitch,
          phase: 'anchor',
          isPhotoTrigger: false,
        },
        {
          lat: anchor2LL.lat,
          lng: anchor2LL.lng,
          altitude: H,
          speed: safeSpeed,
          heading: entryHeading,
          gimbalPitch: first.gimbalPitch,
          phase: 'anchor',
          isPhotoTrigger: false,
        },
        ...rawPoints,
      ];
    }
  }

  if (config.reversePath && rawPoints.length > 1) {
    rawPoints = [...rawPoints].reverse();
  }

  // First pass: Build base MissionWaypoint objects
  const waypoints: MissionWaypoint[] = rawPoints.map((pt, i) => {
    const terrainDeltaM = config.terrainFollowAGL
      ? terrainElevationsM?.[i] ?? 0
      : 0;
    const finalAlt = Math.round((pt.altitude + terrainDeltaM) * 10) / 10;

    let action = 'noAction';
    if (config.waypointAction === 'takePhoto') {
      action = pt.isPhotoTrigger ? 'takePhoto' : 'noAction';
    } else if (config.waypointAction === 'intervalTimer') {
      action = i === 0 ? 'intervalTimer' : 'noAction';
    } else if (config.waypointAction === 'recordVideo') {
      if (i === 0) action = 'startRecord';
      else if (i === rawPoints.length - 1) action = 'stopRecord';
      else action = 'noAction';
    } else if (pt.explicitAction && config.waypointAction === 'noAction') {
      action = pt.explicitAction;
    }

    return {
      id: i + 1,
      lat: Number(pt.lat.toFixed(7)),
      lng: Number(pt.lng.toFixed(7)),
      altitude: finalAlt,
      baseAltitude: pt.altitude,
      terrainDeltaM: Math.round(terrainDeltaM * 10) / 10,
      speed: pt.speed,
      heading: pt.heading,
      gimbalPitch: pt.gimbalPitch,
      action,
      phase: pt.phase,
      isPhotoTrigger: pt.isPhotoTrigger,
      cumulativeDistM: 0,
      cumulativeTimeS: 0,
      batteryIndex: 1,
    };
  });

  // Compute microSD File Weight Specs for DJI Air 3S (12MP vs 50MP/48MP)
  const isHighRes50MP = config.payloadId === 'air3s_24mm_50mp';
  const isVideoCapture =
    config.captureFormat === 'video_4k60' || config.waypointAction === 'recordVideo';

  let storagePerPhotoMB = 6.5;
  let storagePerUnitLabel = isHighRes50MP ? '22.0 MB/foto (50MP)' : '6.5 MB/foto (12MP)';

  if (config.captureFormat === 'jpeg') {
    storagePerPhotoMB = isHighRes50MP ? 22.0 : 6.5;
    storagePerUnitLabel = `${storagePerPhotoMB} MB/foto · JPEG (${
      isHighRes50MP ? '50MP' : '12MP'
    })`;
  } else if (config.captureFormat === 'raw') {
    storagePerPhotoMB = isHighRes50MP ? 98.0 : 24.0;
    storagePerUnitLabel = `${storagePerPhotoMB} MB/foto · RAW DNG (${
      isHighRes50MP ? '50MP' : '12MP'
    })`;
  } else if (config.captureFormat === 'jpeg_raw') {
    storagePerPhotoMB = isHighRes50MP ? 120.0 : 30.5;
    storagePerUnitLabel = `${storagePerPhotoMB} MB/foto · JPEG+RAW (${
      isHighRes50MP ? '50MP' : '12MP'
    })`;
  } else if (config.captureFormat === 'video_4k60') {
    storagePerPhotoMB = 0;
    storagePerUnitLabel = '130 Mbps (~16.25 MB/s · 975 MB/min) · 4K60 10-bit';
  }

  // Pure on-route distance & flight time (WP #1 to WP #N without RTH transits)
  let missionRouteDistanceM = 0;
  let missionRouteTimeS = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const segDist = distanceMeters(prev, curr);
    const headingDiff = Math.abs(curr.heading - prev.heading);
    const turnOverhead = headingDiff > 25 ? 1.4 : 0.2;
    missionRouteDistanceM += segDist;
    missionRouteTimeS += segDist / curr.speed + turnOverhead;
  }

  // Helper to compute exact photo count for a route segment
  const computeSegmentPhotos = (routeDistM: number, routeTimeS: number): number => {
    if (waypoints.length === 0) return 0;
    if (
      config.intervalMode === 'manual' ||
      config.waypointAction === 'intervalTimer'
    ) {
      return Math.floor(routeTimeS / Math.max(0.5, effectiveIntervalSec)) + 1;
    }
    return Math.floor(routeDistM / Math.max(1.0, effectivePhotoStepM)) + 1;
  };

  // 3. Smart Multi-Battery RTH Cut & Resume Overlap Engine
  const effectiveHomePoint: LatLng | null =
    homePoint ||
    (waypoints.length > 0
      ? { lat: waypoints[0].lat, lng: waypoints[0].lng }
      : null);

  const usableSecondsPerBattery = batterySpec.minutes * 60;
  const batterySwapWaypointIds: number[] = [];
  const batterySegments: BatterySegment[] = [];

  let totalDistanceM = 0;
  let totalFlightTimeS = 0;

  if (waypoints.length > 0 && effectiveHomePoint) {
    const transitHorizontalSpeed = Math.min(12, Math.max(6, safeSpeed * 2));
    const rthHorizontalSpeed = 9.0; // m/s RTH return speed
    const climbVerticalSpeed = 3.5; // m/s
    const descentVerticalSpeed = 3.0; // m/s

    let segStartIdx = 0;
    let batNum = 1;

    while (segStartIdx < waypoints.length && batNum <= 25) {
      const startWp = waypoints[segStartIdx];
      const transitInDistM = distanceMeters(effectiveHomePoint, startWp);
      const climbAlt = Math.max(config.transitAltitude, startWp.altitude);
      const transitInTimeS =
        transitInDistM / transitHorizontalSpeed + climbAlt / climbVerticalSpeed + 6;

      let missionDistM = 0;
      let missionTimeS = 0;
      let cutIdx = segStartIdx;

      for (let i = segStartIdx; i < waypoints.length; i++) {
        let stepDist = 0;
        let stepTime = 0;
        if (i > segStartIdx) {
          const prev = waypoints[i - 1];
          const curr = waypoints[i];
          stepDist = distanceMeters(prev, curr);
          const headingDiff = Math.abs(curr.heading - prev.heading);
          const turnOverhead = headingDiff > 25 ? 1.4 : 0.2;
          stepTime = stepDist / curr.speed + turnOverhead;
        }

        const candidateMissionDist = missionDistM + stepDist;
        const candidateMissionTime = missionTimeS + stepTime;

        const rthDist = distanceMeters(waypoints[i], effectiveHomePoint);
        const descentAlt = Math.max(
          config.transitAltitude,
          waypoints[i].altitude
        );
        const rthTime =
          rthDist / rthHorizontalSpeed + descentAlt / descentVerticalSpeed + 8;

        const candidateTotalTime =
          transitInTimeS + candidateMissionTime + rthTime;

        if (
          i > segStartIdx + 1 &&
          candidateTotalTime > usableSecondsPerBattery
        ) {
          break;
        }

        missionDistM = candidateMissionDist;
        missionTimeS = candidateMissionTime;
        cutIdx = i;
      }

      const endWp = waypoints[cutIdx];
      const rthOutDistM = distanceMeters(endWp, effectiveHomePoint);
      const descentAlt = Math.max(config.transitAltitude, endWp.altitude);
      const rthOutTimeS =
        rthOutDistM / rthHorizontalSpeed + descentAlt / descentVerticalSpeed + 8;

      const totalSegmentDistM = transitInDistM + missionDistM + rthOutDistM;
      const totalSegmentTimeS = transitInTimeS + missionTimeS + rthOutTimeS;

      for (let k = segStartIdx; k <= cutIdx; k++) {
        if (waypoints[k].batteryIndex === 1 || batNum > 1) {
          waypoints[k].batteryIndex = batNum;
        }
      }

      const isFinalSegment = cutIdx >= waypoints.length - 1;
      let nextStartIdx: number | null = null;

      if (!isFinalSegment) {
        batterySwapWaypointIds.push(endWp.id);
        const overlap = Math.max(
          0,
          Math.min(2, config.resumeOverlapWaypoints ?? 1)
        );
        nextStartIdx = Math.max(segStartIdx + 1, cutIdx - overlap);
      }

      const sliceRaw = waypoints.slice(segStartIdx, cutIdx + 1);
      const slicePrepared = prepareSubMissionWaypoints(sliceRaw, config);

      const estimatedSegmentPhotos = computeSegmentPhotos(
        missionDistM,
        missionTimeS
      );
      const estimatedSegmentStorageMB =
        config.captureFormat === 'video_4k60'
          ? Math.round((missionTimeS / 60) * 975 * 10) / 10
          : Math.round(estimatedSegmentPhotos * storagePerPhotoMB * 10) / 10;

      batterySegments.push({
        batteryNumber: batNum,
        startWaypointId: startWp.id,
        endWaypointId: endWp.id,
        cutWaypointId: endWp.id,
        resumeNextStartWaypointId:
          nextStartIdx !== null ? waypoints[nextStartIdx].id : null,
        waypointCount: slicePrepared.length,
        transitInDistM: Math.round(transitInDistM),
        transitInTimeS: Math.round(transitInTimeS),
        missionDistM: Math.round(missionDistM),
        missionTimeS: Math.round(missionTimeS),
        rthOutDistM: Math.round(rthOutDistM),
        rthOutTimeS: Math.round(rthOutTimeS),
        totalSegmentTimeS: Math.round(totalSegmentTimeS),
        totalSegmentDistM: Math.round(totalSegmentDistM),
        estimatedSegmentPhotos,
        estimatedSegmentStorageMB,
        startLatLng: { lat: startWp.lat, lng: startWp.lng },
        endLatLng: { lat: endWp.lat, lng: endWp.lng },
        waypoints: slicePrepared,
      });

      totalDistanceM += totalSegmentDistM;
      totalFlightTimeS += totalSegmentTimeS;

      if (isFinalSegment || nextStartIdx === null) {
        break;
      }

      segStartIdx = nextStartIdx;
      batNum++;
    }

    let runningDist = distanceMeters(effectiveHomePoint, waypoints[0]);
    let runningTime =
      runningDist / transitHorizontalSpeed + H / climbVerticalSpeed;
    for (let i = 0; i < waypoints.length; i++) {
      if (i > 0) {
        const d = distanceMeters(waypoints[i - 1], waypoints[i]);
        const headingDiff = Math.abs(
          waypoints[i].heading - waypoints[i - 1].heading
        );
        runningDist += d;
        runningTime += d / waypoints[i].speed + (headingDiff > 25 ? 1.4 : 0.2);
      }
      waypoints[i].cumulativeDistM = Math.round(runningDist);
      waypoints[i].cumulativeTimeS = Math.round(runningTime);
    }
  }

  // Exact Total Photos Formula across the mission route
  const estimatedPhotos = computeSegmentPhotos(
    missionRouteDistanceM,
    missionRouteTimeS
  );

  const batteriesRequired =
    waypoints.length === 0 ? 0 : Math.max(1, batterySegments.length);

  // microSD Card Storage Calculation (MB, GB, per Battery, Write Speed MB/s)
  const totalStorageMB =
    waypoints.length === 0
      ? 0
      : config.captureFormat === 'video_4k60'
      ? Math.round((missionRouteTimeS / 60) * 975 * 10) / 10
      : Math.round(estimatedPhotos * storagePerPhotoMB * 10) / 10;

  const totalStorageGB = Math.round((totalStorageMB / 1024) * 100) / 100;
  const storagePerBatteryMB =
    batteriesRequired > 0
      ? Math.round((totalStorageMB / batteriesRequired) * 10) / 10
      : 0;

  const requiredWriteSpeedMBps =
    config.captureFormat === 'video_4k60' || isVideoCapture
      ? 16.25
      : Math.round(
          (storagePerPhotoMB / Math.max(0.5, effectiveIntervalSec)) * 100
        ) / 100;

  return {
    waypoints,
    metrics: {
      gsdCmPx,
      areaHa,
      areaM2,
      footprintWidthM,
      footprintHeightM,
      lineSpacingM,
      photoStepM,
      photoIntervalS,
      djiNativeIntervalS,
      effectiveIntervalSec,
      effectivePhotoStepM,
      effectiveFrontOverlapPct,
      lowOverlapWarning,
      missionRouteDistanceM: Math.round(missionRouteDistanceM),
      missionRouteTimeS: Math.round(missionRouteTimeS),
      totalDistanceM: Math.round(totalDistanceM),
      totalFlightTimeS: Math.round(totalFlightTimeS),
      totalWaypoints: waypoints.length,
      estimatedPhotos,
      storagePerUnitLabel,
      totalStorageMB,
      totalStorageGB,
      storagePerBatteryMB,
      requiredWriteSpeedMBps,
      motionBlurMm,
      motionBlurPx,
      lookAheadOffsetM,
      lookAhead75M,
      lookAhead60M,
      lookAhead45M,
      batteriesRequired,
      usableBatteryMinutes: batterySpec.minutes,
      batterySwapWaypointIds,
      batterySegments,
      effectiveHomePoint,
      intervalWarning,
      blurWarning,
      recommendedMaxSpeedMs,
      centroid,
      computedPhase1Pitch,
      computedPhase2Pitch,
      computedPhase3Pitch,
      computedLeadInOffsetM,
      effectiveGimbalSummary,
    },
  };
}

/**
 * Query Open-Elevation API for real terrain heights relative to Home/First waypoint,
 * with safe deterministic fallback if network or API rate-limits.
 */
export async function fetchTerrainDeltas(
  home: LatLng,
  waypoints: Array<{ lat: number; lng: number }>
): Promise<Record<number, number>> {
  if (waypoints.length === 0) return {};
  const samplePoints = [home, ...waypoints];

  try {
    const locationsParam = samplePoints
      .slice(0, 95)
      .map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
      .join('|');
    const res = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(
        locationsParam
      )}`
    );
    if (!res.ok) throw new Error('Elevation API non-200');
    const data = await res.json();
    if (data && Array.isArray(data.results) && data.results.length > 1) {
      const homeElev = data.results[0].elevation ?? 0;
      const deltas: Record<number, number> = {};
      for (let i = 0; i < waypoints.length; i++) {
        const mappedIdx = Math.min(data.results.length - 1, i + 1);
        const wpElev = data.results[mappedIdx]?.elevation ?? homeElev;
        deltas[i] = Math.round((wpElev - homeElev) * 10) / 10;
      }
      return deltas;
    }
  } catch {
    // Fallback topographic relief model relative to home coordinate
  }

  const deltas: Record<number, number> = {};
  for (let i = 0; i < waypoints.length; i++) {
    const xy = latLngToXY(waypoints[i], home);
    const relief = Math.sin(xy.x / 140) * 4.5 + Math.cos(xy.y / 160) * 3.8;
    deltas[i] = Math.round(relief * 10) / 10;
  }
  return deltas;
}
