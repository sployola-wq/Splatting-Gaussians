export interface LatLng {
  lat: number;
  lng: number;
}

export type MissionPattern = 'grid_2d' | 'double_grid_3d' | 'orbit_poi' | 'combo_3dgs';

export type WaypointPhase =
  | 'anchor'
  | 'orbit_inner'
  | 'grid_nadir'
  | 'grid_cross'
  | 'orbit_outer'
  | 'imported';

export type WaypointAction =
  | 'noAction'
  | 'takePhoto'
  | 'intervalTimer'
  | 'recordVideo';

export type IntervalTriggerMode = 'auto' | 'manual';

export type CaptureFormatId = 'jpeg' | 'raw' | 'jpeg_raw' | 'video_4k60';

export type DronePayloadId =
  | 'air3s_24mm_12mp'
  | 'air3s_24mm_50mp'
  | 'air3s_70mm_12mp'
  | 'air3_24mm'
  | 'm3e_24mm'
  | 'mini4pro_24mm';

export interface DronePayloadSpec {
  id: DronePayloadId;
  name: string;
  shortName: string;
  sensorDesc: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  focalLengthRealMm: number;
  focalLengthEqMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
  minIntervalSec: number;
  shutterType: 'Electronic' | 'Mechanical';
  defaultShutterDenom: number;
  wpmlDroneEnumValue: number;
  wpmlDroneSubEnumValue: number;
  wpmlPayloadEnumValue: number;
}

export type BatteryPreset = 'wind_28' | 'optimal_30' | 'max_32';

export type DrawToolMode = 'none' | 'polygon' | 'rectangle' | 'circle' | 'home';

export interface MissionConfig {
  pattern: MissionPattern;
  altitude: number; // m relative to takeoff (15 - 500, default 70)
  transitAltitude: number; // m initial / RTH safe altitude (default 60)
  speed: number; // m/s (1 - 15, default 2.5 for 3DGS high accuracy)
  frontOverlap: number; // % (50 - 90, default 80)
  sideOverlap: number; // % (40 - 85, default 70)
  customLineSpacingM: number | null; // if user overrides street spacing directly
  gimbalPitch: number; // deg (-90 to 0)
  gridAngle: number; // deg (0 - 359)
  payloadId: DronePayloadId;
  generateEveryPoint: boolean;
  waypointAction: WaypointAction;
  // Intervalometer & SD Storage Controls
  intervalMode: IntervalTriggerMode; // 'auto' (by front overlap & V) | 'manual' (fixed every X sec)
  customIntervalSec: number; // 2, 3, 5, 7, 10, 15, 30 or custom seconds
  captureFormat: CaptureFormatId; // 'jpeg' | 'raw' | 'jpeg_raw' | 'video_4k60'
  reversePath: boolean;
  straightenPaths: boolean;
  terrainFollowAGL: boolean;
  highAccuracyAnchor: boolean;
  shutterSpeedDenom: number; // e.g., 800 for 1/800s
  batteryPreset: BatteryPreset;
  orbitInnerGimbal: number; // -75 deg default for Combo 3DGS Phase 1
  orbitOuterGimbal: number; // -45 deg default for Combo 3DGS Phase 3
  orbitInnerPoints: number; // 34 default
  orbitOuterPoints: number; // 44 default
  autoSmartGimbal: boolean; // Auto-calculate trigonometric gimbal pitch based on altitude, radius, and pattern
  // Multi-Battery Continuity & Field Resume Controls
  resumeOverlapWaypoints: number; // 0, 1, or 2 waypoints of overlap when resuming next battery (default 1)
  showRthLines: boolean; // Visualize RTH & Resume dashed trajectories on map
  resumeFromWaypointId: number; // 1 to N emergency field resume starting waypoint
}

export interface MissionWaypoint {
  id: number;
  lat: number;
  lng: number;
  altitude: number; // Final execute height (m relative to Home)
  baseAltitude: number; // Planned AGL altitude
  terrainDeltaM: number; // Elevation delta relative to Home
  speed: number;
  heading: number; // -180 to 180 or 0 to 360
  gimbalPitch: number;
  action: string; // 'noAction' | 'takePhoto' | 'intervalTimer' | 'startRecord' | 'stopRecord'
  phase: WaypointPhase;
  isPhotoTrigger: boolean;
  cumulativeDistM: number;
  cumulativeTimeS: number;
  batteryIndex: number; // 1, 2, 3...
}

export interface BatterySegment {
  batteryNumber: number;
  startWaypointId: number; // 1-based original waypoint ID (includes resume overlap)
  endWaypointId: number; // 1-based original waypoint ID where RTH cut occurs
  cutWaypointId: number; // The exact waypoint where RTH is triggered
  resumeNextStartWaypointId: number | null; // Where the next battery will resume (e.g., cutId - 1)
  waypointCount: number;
  transitInDistM: number;
  transitInTimeS: number;
  missionDistM: number;
  missionTimeS: number;
  rthOutDistM: number;
  rthOutTimeS: number;
  totalSegmentTimeS: number;
  totalSegmentDistM: number;
  estimatedSegmentPhotos: number;
  estimatedSegmentStorageMB: number;
  startLatLng: LatLng;
  endLatLng: LatLng;
  waypoints: MissionWaypoint[];
}

export interface MissionMetrics {
  gsdCmPx: number;
  areaHa: number;
  areaM2: number;
  footprintWidthM: number;
  footprintHeightM: number;
  lineSpacingM: number;
  photoStepM: number; // Distance between photos (m)
  photoIntervalS: number; // Theoretical interval t = d / V (s)
  djiNativeIntervalS: number; // Nearest DJI Air 3S interval (2, 3, 5, 7, 10, 15, 30s)
  effectiveIntervalSec: number; // Active trigger interval X (s)
  effectivePhotoStepM: number; // Active distance between shots (m)
  effectiveFrontOverlapPct: number; // Resulting front overlap (%) at speed V and interval X
  lowOverlapWarning: boolean; // True if resulting front overlap < 70%
  missionRouteDistanceM: number; // Pure on-route distance from WP#1 to WP#N (excluding RTH transits)
  missionRouteTimeS: number; // Pure on-route flight time from WP#1 to WP#N (excluding RTH transits)
  totalDistanceM: number; // Total distance including multi-battery RTH transits
  totalFlightTimeS: number; // Total flight time including multi-battery RTH transits
  totalWaypoints: number;
  estimatedPhotos: number;
  // microSD Card Storage Telemetry
  storagePerUnitLabel: string; // e.g. '6.5 MB/foto' or '975 MB/min'
  totalStorageMB: number;
  totalStorageGB: number;
  storagePerBatteryMB: number;
  requiredWriteSpeedMBps: number;
  motionBlurMm: number;
  motionBlurPx: number;
  lookAheadOffsetM: number;
  lookAhead75M: number;
  lookAhead60M: number;
  lookAhead45M: number;
  batteriesRequired: number;
  usableBatteryMinutes: number;
  batterySwapWaypointIds: number[];
  batterySegments: BatterySegment[];
  effectiveHomePoint: LatLng | null;
  intervalWarning: 'ok' | 'warning' | 'critical';
  blurWarning: 'ok' | 'warning' | 'critical';
  recommendedMaxSpeedMs: number;
  centroid: LatLng | null;
  // Dynamic Trigonometric Gimbal Telemetry
  computedPhase1Pitch: number;
  computedPhase2Pitch: number;
  computedPhase3Pitch: number;
  computedLeadInOffsetM: number;
  effectiveGimbalSummary: string;
}

export interface ImportedMissionMeta {
  fileName: string;
  uuid: string;
  author: string;
  createTime: number;
  isImportedOverride: boolean;
}
