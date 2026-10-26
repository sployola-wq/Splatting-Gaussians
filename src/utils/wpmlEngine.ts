import JSZip from 'jszip';
import { DRONE_PAYLOADS } from '../constants/drones';
import {
  BatterySegment,
  ImportedMissionMeta,
  LatLng,
  MissionConfig,
  MissionWaypoint,
  WaypointPhase,
} from '../types/mission';
import {
  distanceMeters,
  prepareSubMissionWaypoints,
  snapToDjiNativeInterval,
} from './missionEngine';

function computeEffectiveWpmlIntervalSec(config: MissionConfig): number {
  const payload = DRONE_PAYLOADS[config.payloadId] || DRONE_PAYLOADS.air3s_24mm_12mp;
  if (config.intervalMode === 'manual') {
    return Math.max(1, Math.round(Number(config.customIntervalSec) || 2));
  }
  const H = Math.max(10, config.altitude);
  const footprintHeightM =
    (H * payload.sensorHeightMm) / payload.focalLengthRealMm;
  const photoStepM =
    footprintHeightM *
    (1 - Math.min(92, Math.max(20, config.frontOverlap)) / 100);
  const rawSec = photoStepM / Math.max(0.5, config.speed);
  return snapToDjiNativeInterval(rawSec, payload.minIntervalSec);
}

/**
 * Generate wpmz/template.kml according to DJI WPML 3.0 standard.
 * Waypoints are always indexed sequentially from 0 to N-1 for DJI Fly compatibility.
 */
export function generateTemplateKml(
  waypoints: MissionWaypoint[],
  config: MissionConfig,
  meta?: ImportedMissionMeta | null
): string {
  const payload = DRONE_PAYLOADS[config.payloadId] || DRONE_PAYLOADS.air3s_24mm_12mp;
  const now = meta?.createTime || Date.now();
  const author = meta?.author || 'SPLS Air 3S Mission Studio';
  const turnMode = config.straightenPaths
    ? 'toPointAndStopWithDiscontinuityCurvature'
    : 'toPointAndPassWithContinuityCurvature';

  const preparedWaypoints = prepareSubMissionWaypoints(waypoints, config);
  const intervalSec = computeEffectiveWpmlIntervalSec(config);

  const placemarks = preparedWaypoints
    .map((wp, idx) => {
      const actionBlock = buildWpmlActionGroupsXml(
        wp,
        idx,
        preparedWaypoints.length,
        intervalSec
      );
      return `      <Placemark>
        <Point>
          <coordinates>${wp.lng.toFixed(7)},${wp.lat.toFixed(7)}</coordinates>
        </Point>
        <wpml:index>${idx}</wpml:index>
        <wpml:ellipsoidHeight>${wp.altitude.toFixed(1)}</wpml:ellipsoidHeight>
        <wpml:height>${wp.altitude.toFixed(1)}</wpml:height>
        <wpml:useGlobalHeight>0</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>0</wpml:useGlobalSpeed>
        <wpml:waypointSpeed>${wp.speed.toFixed(1)}</wpml:waypointSpeed>
        <wpml:useGlobalHeadingParam>0</wpml:useGlobalHeadingParam>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.heading.toFixed(1)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:useStraightLine>${config.straightenPaths ? 1 : 0}</wpml:useStraightLine>${actionBlock}
      </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>${author}</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${Date.now()}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${config.transitAltitude.toFixed(1)}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${Math.min(12, Math.max(5, config.speed * 2)).toFixed(1)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${payload.wpmlDroneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${payload.wpmlDroneSubEnumValue}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payload.wpmlPayloadEnumValue}</wpml:payloadEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${config.speed.toFixed(1)}</wpml:autoFlightSpeed>
      <wpml:globalHeight>${config.altitude.toFixed(1)}</wpml:globalHeight>
      <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
      <wpml:gimbalPitchMode>usePointSetting</wpml:gimbalPitchMode>
      <wpml:globalWaypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>${turnMode}</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>${config.straightenPaths ? 1 : 0}</wpml:globalUseStraightLine>
${placemarks}
    </Folder>
  </Document>
</kml>`;
}

function buildWpmlActionGroupsXml(
  wp: MissionWaypoint,
  idx: number,
  totalWaypoints: number,
  intervalSec: number
): string {
  const actionsXml: string[] = [];
  let actionId = 0;

  // Always set gimbal pitch on each waypoint
  actionsXml.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${wp.gimbalPitch.toFixed(1)}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);

  if (wp.action === 'takePhoto') {
    actionsXml.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
  } else if (wp.action === 'startRecord') {
    actionsXml.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
  } else if (wp.action === 'stopRecord') {
    actionsXml.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
  }

  let reachPointGroup = `
        <wpml:actionGroup>
          <wpml:actionGroupId>${idx}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${actionsXml.join('\n')}
        </wpml:actionGroup>`;

  // Inject continuous intervalometer (multipleTiming every X seconds) spanning the route from WP 0
  if (wp.action === 'intervalTimer') {
    const endIdx = Math.max(0, totalWaypoints - 1);
    const intervalGroupId = totalWaypoints + 1;
    reachPointGroup += `
        <wpml:actionGroup>
          <wpml:actionGroupId>${intervalGroupId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${endIdx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>multipleTiming</wpml:actionTriggerType>
            <wpml:actionTriggerParam>${intervalSec}</wpml:actionTriggerParam>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`;
  }

  return reachPointGroup;
}

/**
 * Generate wpmz/waylines.wpml executable file for DJI Fly (Air 3S / RC 2) & DJI Pilot 2.
 * Waypoints are always re-indexed from 0 to N-1 for sub-mission & resume compatibility.
 */
export function generateWaylinesWpml(
  waypoints: MissionWaypoint[],
  config: MissionConfig,
  totalDistanceM: number,
  totalTimeS: number
): string {
  const payload = DRONE_PAYLOADS[config.payloadId] || DRONE_PAYLOADS.air3s_24mm_12mp;
  const turnMode = config.straightenPaths
    ? 'toPointAndStopWithDiscontinuityCurvature'
    : 'toPointAndPassWithContinuityCurvature';

  const preparedWaypoints = prepareSubMissionWaypoints(waypoints, config);
  const intervalSec = computeEffectiveWpmlIntervalSec(config);

  const placemarks = preparedWaypoints
    .map((wp, idx) => {
      const actionBlock = buildWpmlActionGroupsXml(
        wp,
        idx,
        preparedWaypoints.length,
        intervalSec
      );
      return `      <Placemark>
        <Point>
          <coordinates>${wp.lng.toFixed(7)},${wp.lat.toFixed(7)}</coordinates>
        </Point>
        <wpml:index>${idx}</wpml:index>
        <wpml:executeHeight>${wp.altitude.toFixed(1)}</wpml:executeHeight>
        <wpml:waypointSpeed>${wp.speed.toFixed(1)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${wp.heading.toFixed(1)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0.2</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${config.straightenPaths ? 1 : 0}</wpml:useStraightLine>${actionBlock}
      </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${config.transitAltitude.toFixed(1)}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${Math.min(12, Math.max(5, config.speed * 2)).toFixed(1)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${payload.wpmlDroneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${payload.wpmlDroneSubEnumValue}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payload.wpmlPayloadEnumValue}</wpml:payloadEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${totalDistanceM.toFixed(1)}</wpml:distance>
      <wpml:duration>${totalTimeS.toFixed(1)}</wpml:duration>
      <wpml:autoFlightSpeed>${config.speed.toFixed(1)}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>`;
}

/**
 * Package wpmz/template.kml and wpmz/waylines.wpml into a .KMZ file using JSZip and download
 */
export async function exportDjiKmz(
  waypoints: MissionWaypoint[],
  config: MissionConfig,
  totalDistanceM: number,
  totalTimeS: number,
  meta?: ImportedMissionMeta | null,
  customFileNameOverride?: string
): Promise<void> {
  const zip = new JSZip();
  const wpmzFolder = zip.folder('wpmz');
  if (!wpmzFolder) throw new Error('No se pudo crear carpeta wpmz en archivo KMZ');

  const prepared = prepareSubMissionWaypoints(waypoints, config);

  const templateKml = generateTemplateKml(prepared, config, meta);
  const waylinesWpml = generateWaylinesWpml(
    prepared,
    config,
    totalDistanceM,
    totalTimeS
  );

  wpmzFolder.file('template.kml', templateKml);
  wpmzFolder.file('waylines.wpml', waylinesWpml);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const fileName = customFileNameOverride
    ? customFileNameOverride.endsWith('.kmz')
      ? customFileNameOverride
      : `${customFileNameOverride}.kmz`
    : meta?.fileName && meta.fileName.endsWith('.kmz')
    ? meta.fileName
    : `SPLS_Air3S_${config.pattern}_${prepared.length}wp.kmz`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export an individual battery segment as a standalone DJI .KMZ sub-mission
 * Re-indexed from 0, with startRecord/stopRecord injected if video mode is active, and finishAction = goHome.
 */
export async function exportBatterySegmentKmz(
  segment: BatterySegment,
  config: MissionConfig,
  meta?: ImportedMissionMeta | null
): Promise<string> {
  const basePrefix =
    meta?.fileName && meta.fileName.endsWith('.kmz')
      ? meta.fileName.replace(/\.kmz$/i, '')
      : 'Mision';

  const fileName = `${basePrefix}_Parte${segment.batteryNumber}_Bat${segment.batteryNumber}_WP${segment.startWaypointId}-${segment.endWaypointId}.kmz`;

  await exportDjiKmz(
    segment.waypoints,
    config,
    segment.totalSegmentDistM,
    segment.totalSegmentTimeS,
    meta,
    fileName
  );

  return fileName;
}

/**
 * Export an emergency field resume .KMZ starting from a specific Waypoint #X up to the end of the mission
 */
export async function exportEmergencyResumeKmz(
  allWaypoints: MissionWaypoint[],
  startWaypointId: number,
  config: MissionConfig,
  meta?: ImportedMissionMeta | null
): Promise<string> {
  const startIdx = Math.max(
    0,
    Math.min(allWaypoints.length - 1, startWaypointId - 1)
  );
  const slice = allWaypoints.slice(startIdx);
  if (slice.length === 0) {
    throw new Error('No hay waypoints disponibles desde el punto seleccionado.');
  }

  let distM = 0;
  let timeS = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = distanceMeters(slice[i - 1], slice[i]);
    distM += d;
    timeS += d / Math.max(0.5, slice[i].speed) + 0.5;
  }

  const firstId = slice[0].id;
  const lastId = slice[slice.length - 1].id;
  const basePrefix =
    meta?.fileName && meta.fileName.endsWith('.kmz')
      ? meta.fileName.replace(/\.kmz$/i, '')
      : `SPLS_Air3S_${config.pattern}`;

  const fileName =
    startIdx === 0
      ? meta?.fileName || `${basePrefix}_Completa_WP1-${lastId}.kmz`
      : `${basePrefix}_Reanudar_WP${firstId}-${lastId}.kmz`;

  await exportDjiKmz(slice, config, distM, timeS, meta, fileName);
  return fileName;
}

/**
 * Classify waypoint phase from gimbal pitch angle
 */
function inferPhaseFromGimbal(gimbal: number): WaypointPhase {
  if (Math.abs(gimbal - -75) <= 6) return 'orbit_inner';
  if (Math.abs(gimbal - -90) <= 5) return 'grid_nadir';
  if (Math.abs(gimbal - -45) <= 8) return 'orbit_outer';
  return 'imported';
}

/**
 * Compute bounding rectangle polygon around imported waypoints
 */
export function buildBoundingPolygonFromWaypoints(
  pts: Array<{ lat: number; lng: number }>
): LatLng[] {
  if (pts.length === 0) return [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const padLat = Math.max(0.00015, (maxLat - minLat) * 0.04);
  const padLng = Math.max(0.00015, (maxLng - minLng) * 0.04);
  return [
    { lat: maxLat - padLat, lng: minLng + padLng },
    { lat: maxLat - padLat, lng: maxLng - padLng },
    { lat: minLat + padLat, lng: maxLng - padLng },
    { lat: minLat + padLat, lng: minLng + padLng },
  ];
}

/**
 * Parse WaypointMap JSON format
 */
export function parseWaypointJson(
  jsonStr: string,
  fileName = 'mission_import.kmz'
): {
  waypoints: MissionWaypoint[];
  polygon: LatLng[];
  inferredAltitude: number;
  inferredSpeed: number;
  meta: ImportedMissionMeta;
} {
  const parsed = JSON.parse(jsonStr);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.waypoints)
    ? parsed.waypoints
    : [];
  if (arr.length === 0) {
    throw new Error('El JSON no contiene waypoints válidos.');
  }

  const waypoints: MissionWaypoint[] = arr.map(
    (item: Record<string, unknown>, idx: number) => {
      const lat = Number(item.Latitude ?? item.lat ?? item.latitude ?? 0);
      const lng = Number(item.Longitude ?? item.lng ?? item.lon ?? item.longitude ?? 0);
      const altitude = Number(item.altitude ?? item.height ?? 70);
      const speed = Number(item.speed ?? 2.5);
      const heading = Number(item.heading ?? 0);
      const gimbalPitch = Number(item.gimbalAngle ?? item.gimbalPitch ?? -90);
      const action = String(item.action ?? 'noAction');

      return {
        id: Number(item.id ?? idx + 1),
        lat,
        lng,
        altitude,
        baseAltitude: altitude,
        terrainDeltaM: 0,
        speed,
        heading,
        gimbalPitch,
        action,
        phase: inferPhaseFromGimbal(gimbalPitch),
        isPhotoTrigger: true,
        cumulativeDistM: 0,
        cumulativeTimeS: 0,
        batteryIndex: 1,
      };
    }
  );

  const gridPts = waypoints.filter((w) => w.phase === 'grid_nadir');
  const polygon = buildBoundingPolygonFromWaypoints(
    gridPts.length >= 3 ? gridPts : waypoints
  );

  return {
    waypoints,
    polygon,
    inferredAltitude: waypoints[0]?.altitude || 70,
    inferredSpeed: waypoints[0]?.speed || 2.5,
    meta: {
      fileName: fileName.endsWith('.kmz')
        ? fileName
        : `${fileName.replace(/\.json$/i, '')}.kmz`,
      uuid: fileName.replace(/\.kmz$/i, ''),
      author: 'SPLS Air 3S Mission Studio',
      createTime: Date.now(),
      isImportedOverride: true,
    },
  };
}

/**
 * Parse an uploaded DJI .KMZ file (extracts wpmz/waylines.wpml or wpmz/template.kml)
 */
export async function parseDjiKmzFile(file: File): Promise<{
  waypoints: MissionWaypoint[];
  polygon: LatLng[];
  inferredAltitude: number;
  inferredSpeed: number;
  meta: ImportedMissionMeta;
}> {
  const zip = await JSZip.loadAsync(file);
  const wpmlFile =
    zip.file('wpmz/waylines.wpml') ||
    zip.file('wpmz/template.kml') ||
    Object.values(zip.files).find(
      (f) => f.name.endsWith('.wpml') || f.name.endsWith('.kml')
    );

  if (!wpmlFile) {
    throw new Error('El archivo .KMZ no contiene wpmz/waylines.wpml ni template.kml');
  }

  const xmlText = await wpmlFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));

  const waypoints: MissionWaypoint[] = placemarks.map((pm, idx) => {
    const coordsText =
      pm.getElementsByTagName('coordinates')[0]?.textContent?.trim() || '0,0';
    const [lngStr, latStr] = coordsText.split(',');
    const lng = parseFloat(lngStr) || 0;
    const lat = parseFloat(latStr) || 0;

    const getTagNum = (localName: string, fallback: number): number => {
      const el =
        pm.getElementsByTagName(`wpml:${localName}`)[0] ||
        pm.getElementsByTagName(localName)[0];
      if (!el || !el.textContent) return fallback;
      const n = parseFloat(el.textContent.trim());
      return isNaN(n) ? fallback : n;
    };

    const altitude = getTagNum('executeHeight', getTagNum('height', 70));
    const speed = getTagNum('waypointSpeed', 2.5);
    const heading = getTagNum('waypointHeadingAngle', 0);
    const gimbalPitch = getTagNum('gimbalPitchRotateAngle', -75);

    const funcEls = Array.from(
      pm.getElementsByTagName('wpml:actionActuatorFunc')
    );
    let action = 'noAction';
    for (const f of funcEls) {
      const txt = f.textContent?.trim();
      if (txt === 'takePhoto' || txt === 'startRecord' || txt === 'stopRecord') {
        action = txt;
      }
    }

    return {
      id: idx + 1,
      lat,
      lng,
      altitude,
      baseAltitude: altitude,
      terrainDeltaM: 0,
      speed,
      heading,
      gimbalPitch,
      action,
      phase: inferPhaseFromGimbal(gimbalPitch),
      isPhotoTrigger: true,
      cumulativeDistM: 0,
      cumulativeTimeS: 0,
      batteryIndex: 1,
    };
  });

  const gridPts = waypoints.filter((w) => w.phase === 'grid_nadir');
  const polygon =
    waypoints.length >= 3
      ? buildBoundingPolygonFromWaypoints(gridPts.length >= 3 ? gridPts : waypoints)
      : [];

  return {
    waypoints,
    polygon,
    inferredAltitude: waypoints[0]?.altitude || 70,
    inferredSpeed: waypoints[0]?.speed || 2.5,
    meta: {
      fileName: file.name,
      uuid: file.name.replace(/\.kmz$/i, ''),
      author: 'SPLS Air 3S Mission Studio',
      createTime: Date.now(),
      isImportedOverride: waypoints.length > 0,
    },
  };
}
