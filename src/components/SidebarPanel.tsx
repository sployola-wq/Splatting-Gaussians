import React, { useState } from 'react';
import {
  Compass,
  Cpu,
  ShieldCheck,
  Sliders,
  Sparkles,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Mountain,
  Camera,
  BatteryCharging,
  Gauge,
  RefreshCw,
  Download,
  Scissors,
  Route,
  HardDrive,
  Timer,
} from 'lucide-react';
import {
  BATTERY_PRESETS,
  DJI_INTERVAL_PRESETS,
  DRONE_PAYLOADS,
} from '../constants/drones';
import {
  BatterySegment,
  CaptureFormatId,
  DronePayloadId,
  ImportedMissionMeta,
  LatLng,
  MissionConfig,
  MissionMetrics,
  MissionPattern,
  MissionWaypoint,
  WaypointAction,
} from '../types/mission';
import {
  exportBatterySegmentKmz,
  exportDjiKmz,
  exportEmergencyResumeKmz,
} from '../utils/wpmlEngine';

interface SidebarPanelProps {
  config: MissionConfig;
  onChangeConfig: (updater: (prev: MissionConfig) => MissionConfig) => void;
  metrics: MissionMetrics;
  waypoints: MissionWaypoint[];
  polygon: LatLng[];
  onOptimizeGridAngle: () => void;
  isFetchingTerrain: boolean;
  onRefreshTerrain: () => void;
  hasImportedOverride: boolean;
  onReleaseImportedOverride: () => void;
  importedMeta: ImportedMissionMeta | null;
  onNotifyToast: (msg: string) => void;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({
  config,
  onChangeConfig,
  metrics,
  waypoints,
  polygon,
  onOptimizeGridAngle,
  isFetchingTerrain,
  onRefreshTerrain,
  hasImportedOverride,
  onReleaseImportedOverride,
  importedMeta,
  onNotifyToast,
}) => {
  const [activeTab, setActiveTab] = useState<'geometry' | 'drone' | 'physics'>(
    'geometry'
  );

  const currentPayload =
    DRONE_PAYLOADS[config.payloadId] || DRONE_PAYLOADS.air3s_24mm_12mp;

  const patternCards: Array<{
    id: MissionPattern;
    title: string;
    subtitle: string;
    highlight?: string;
  }> = [
    {
      id: 'combo_3dgs',
      title: 'Combo 3DGS Pro (Híbrido 3 Fases)',
      subtitle: 'Órbita Interna (-75°) + Grilla Nadir (-90°) + Órbita Externa (-45°)',
      highlight: 'Recomendado 3DGS',
    },
    {
      id: 'grid_2d',
      title: 'Grilla Simple (2D Nadir)',
      subtitle: 'Barrido Lawnmower clásico ortomosaico',
    },
    {
      id: 'double_grid_3d',
      title: 'Grilla Doble Cruzada (3D)',
      subtitle: 'Pasadas perpendiculares 0° y 90° oblicuas',
    },
    {
      id: 'orbit_poi',
      title: 'Órbita Circular / POI',
      subtitle: 'Anillo perimetral apuntando al centroide',
    },
  ];

  const handleAutoAdjustSpeed = () => {
    const safeV = Math.max(1.0, Math.min(15, metrics.recommendedMaxSpeedMs));
    onChangeConfig((prev) => ({
      ...prev,
      speed: safeV,
    }));
  };

  const formatDurationShort = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const handleDownloadSegmentKmz = async (seg: BatterySegment) => {
    const fname = await exportBatterySegmentKmz(seg, config, importedMeta);
    onNotifyToast(
      `Sub-misión Batería #${seg.batteryNumber} exportada: ${fname}`
    );
  };

  const handleDownloadFullKmz = async () => {
    if (waypoints.length === 0) return;
    await exportDjiKmz(
      waypoints,
      config,
      metrics.totalDistanceM,
      metrics.totalFlightTimeS,
      importedMeta
    );
    onNotifyToast(
      `Misión completa única (.KMZ) exportada con ${waypoints.length} waypoints.`
    );
  };

  const handleDownloadEmergencyResume = async () => {
    if (waypoints.length === 0) return;
    const startWp = Math.max(
      1,
      Math.min(waypoints.length, config.resumeFromWaypointId)
    );
    const fname = await exportEmergencyResumeKmz(
      waypoints,
      startWp,
      config,
      importedMeta
    );
    onNotifyToast(
      `Misión de reanudación exportada (WP #${startWp} a #${waypoints.length}): ${fname}`
    );
  };

  const safeResumeWpId = Math.max(
    1,
    Math.min(Math.max(1, waypoints.length), config.resumeFromWaypointId)
  );

  return (
    <aside className="w-[385px] shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col select-none z-20">
      {/* 3-Tab Segmented Navigation Header */}
      <div className="p-2.5 border-b border-slate-800 bg-slate-950/60">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('geometry')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'geometry'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>1. Patrón</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drone')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'drone'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>2. Air 3S</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('physics')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'physics'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>3. Física & Bat</span>
            {(metrics.intervalWarning !== 'ok' ||
              metrics.blurWarning !== 'ok' ||
              metrics.batteriesRequired > 1) && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        </div>
      </div>

      {/* Imported Mission Notice Banner */}
      {hasImportedOverride && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-sky-950/60 border border-sky-500/40 flex items-center justify-between gap-2">
          <div className="text-[11px] text-sky-200 leading-tight">
            <span className="font-semibold block">Misión Importada Activa</span>
            <span>Puedes ajustar Altitud/Velocidad o regenerar desde el polígono.</span>
          </div>
          <button
            type="button"
            onClick={onReleaseImportedOverride}
            className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[11px] font-medium border border-sky-500/40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Regenerar
          </button>
        </div>
      )}

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
        {/* =========================================================
            TAB 1: PATRÓN & GEOMETRÍA
        ========================================================= */}
        {activeTab === 'geometry' && (
          <>
            {/* Recipe Selector */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  Receta de Misión Fotogramétrica / 3DGS
                </h3>
                <span className="text-[11px] text-slate-400">4 Modos</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {patternCards.map((card) => {
                  const isSelected = config.pattern === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        if (hasImportedOverride) onReleaseImportedOverride();
                        onChangeConfig((prev) => ({
                          ...prev,
                          pattern: card.id,
                        }));
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/12 border-sky-500/70 text-slate-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">
                          {card.title}
                        </span>
                        {card.highlight && (
                          <span className="text-[10px] font-mono text-cyan-300">
                            ★ {card.highlight}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {card.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* 3-Phase Breakdown when Combo 3DGS Pro is active */}
              {config.pattern === 'combo_3dgs' && (
                <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-[11px]">
                  <div className="font-semibold text-slate-200 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Configuración Híbrida 3 Fases (3DGS)</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {config.autoSmartGimbal ? 'Auto Trig.' : 'Manual'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="text-cyan-300 font-medium">
                        Fase 1 · Órbita Interna ({metrics.computedPhase1Pitch}° POI)
                      </span>
                      <div className="flex items-center gap-1 font-mono">
                        <input
                          type="number"
                          min={12}
                          max={72}
                          value={config.orbitInnerPoints}
                          onChange={(e) =>
                            onChangeConfig((prev) => ({
                              ...prev,
                              orbitInnerPoints: Math.max(
                                12,
                                Math.min(72, Number(e.target.value) || 34)
                              ),
                            }))
                          }
                          className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-200 text-[11px]"
                        />
                        <span>WP</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-300 font-medium">
                        Fase 2 · Grilla Central ({metrics.computedPhase2Pitch}°{' '}
                        {metrics.computedPhase2Pitch === -90 ? 'Nadir' : 'Oblicua'})
                      </span>
                      <span className="font-mono text-slate-300">
                        Automática
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-300 font-medium">
                        Fase 3 · Órbita Externa +20% ({metrics.computedPhase3Pitch}° POI)
                      </span>
                      <div className="flex items-center gap-1 font-mono">
                        <input
                          type="number"
                          min={16}
                          max={90}
                          value={config.orbitOuterPoints}
                          onChange={(e) =>
                            onChangeConfig((prev) => ({
                              ...prev,
                              orbitOuterPoints: Math.max(
                                16,
                                Math.min(90, Number(e.target.value) || 44)
                              ),
                            }))
                          }
                          className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-200 text-[11px]"
                        />
                        <span>WP</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <div className="h-px bg-slate-800" />

            {/* Altitude & Transit Altitude */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Altitud y Velocidad Operativa
              </h3>

              {/* Mapping Altitude */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Altitud de Mapeo (AGL)</span>
                  <span className="font-mono font-semibold text-sky-300 tabular-nums">
                    {config.altitude} m · GSD {metrics.gsdCmPx.toFixed(2)} cm/px
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={15}
                    max={500}
                    step={1}
                    value={config.altitude}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        altitude: Number(e.target.value),
                      }))
                    }
                    className="flex-1 accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min={15}
                    max={500}
                    value={config.altitude}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        altitude: Math.max(
                          15,
                          Math.min(500, Number(e.target.value) || 70)
                        ),
                      }))
                    }
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-right text-slate-100 tabular-nums"
                  />
                </div>
              </div>

              {/* Safe Transit / RTH Altitude */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">
                  Altitud Seguridad Tránsito / RTH (m)
                </span>
                <input
                  type="number"
                  min={15}
                  max={500}
                  value={config.transitAltitude}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      transitAltitude: Math.max(
                        15,
                        Math.min(500, Number(e.target.value) || 60)
                      ),
                    }))
                  }
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-right text-slate-100 tabular-nums"
                />
              </div>

              {/* Flight Speed + Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Velocidad de Vuelo</span>
                  <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                    {config.speed.toFixed(1)} m/s ({(config.speed * 3.6).toFixed(1)}{' '}
                    km/h)
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={config.speed}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      speed: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({ ...prev, speed: 2.5 }))
                    }
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      config.speed === 2.5
                        ? 'bg-sky-500/20 border-sky-500 text-sky-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    2.5 m/s (3DGS Pro)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({ ...prev, speed: 6.0 }))
                    }
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      config.speed === 6.0
                        ? 'bg-sky-500/20 border-sky-500 text-sky-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    6.0 m/s (Estándar)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({ ...prev, speed: 8.0 }))
                    }
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                      config.speed === 8.0
                        ? 'bg-sky-500/20 border-sky-500 text-sky-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    8.0 m/s (Rápido)
                  </button>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* Overlaps & Street Spacing */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Solapamiento y Distancia Entre Calles
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Frontal (%)</span>
                    <span className="font-mono font-semibold text-slate-100 tabular-nums">
                      {config.frontOverlap}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={90}
                    step={1}
                    value={config.frontOverlap}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        frontOverlap: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="text-[10px] font-mono text-slate-400">
                    Avance foto: {metrics.photoStepM.toFixed(1)} m
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Lateral (%)</span>
                    <span className="font-mono font-semibold text-slate-100 tabular-nums">
                      {config.sideOverlap}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={85}
                    step={1}
                    value={config.sideOverlap}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        sideOverlap: Number(e.target.value),
                        customLineSpacingM: null,
                      }))
                    }
                    className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="text-[10px] font-mono text-slate-400">
                    Calle: {metrics.lineSpacingM.toFixed(1)} m
                  </div>
                </div>
              </div>

              {/* Direct Street Spacing Override */}
              <div className="flex items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-lg p-2 text-xs">
                <div>
                  <span className="text-slate-300 block font-medium">
                    Distancia entre calles (m)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {config.customLineSpacingM !== null
                      ? 'Ajuste manual activo'
                      : 'Calculado por solape lateral'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2}
                    max={250}
                    step={0.5}
                    value={metrics.lineSpacingM}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        customLineSpacingM: Math.max(
                          2,
                          Number(e.target.value) || 15
                        ),
                      }))
                    }
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-mono text-xs text-sky-300 tabular-nums"
                  />
                  {config.customLineSpacingM !== null && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          customLineSpacingM: null,
                        }))
                      }
                      title="Restaurar cálculo automático por porcentaje de solapamiento"
                      className="px-1.5 py-1 rounded bg-slate-800 text-[10px] text-slate-300 hover:text-white cursor-pointer"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* Gimbal Angle & Grid Heading */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Inteligencia de Cámara (Gimbal Pitch) y Rumbo
              </h3>

              {/* Switch: Auto-Ángulo Inteligente de Cámara (Según Altura y Ruta) */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-100 leading-snug">
                    🎯 Auto-Ángulo Inteligente de Cámara (Según Altura y Ruta)
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        autoSmartGimbal: !prev.autoSmartGimbal,
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors shrink-0 cursor-pointer ${
                      config.autoSmartGimbal
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {config.autoSmartGimbal ? 'ON (Auto)' : 'OFF (Manual)'}
                  </button>
                </div>

                {/* Live Effective Gimbal Telemetry Badge */}
                <div className="p-2 rounded bg-slate-900/90 border border-sky-500/30 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Telemetría de Inclinación Efectiva (@ H={config.altitude}m)</span>
                    <span className="font-mono text-sky-300 font-semibold">
                      pitch = -atan(H / D_poi)
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-cyan-300 leading-snug">
                    {metrics.effectiveGimbalSummary}
                  </div>
                  {metrics.computedLeadInOffsetM > 0 && (
                    <div className="text-[10px] font-mono text-emerald-300">
                      Margen de entrada oblicuo (Lead-in offset): +
                      {metrics.computedLeadInOffsetM.toFixed(1)} m al inicio de cada calle
                    </div>
                  )}
                </div>

                {/* Manual Sliders when Auto-Ángulo is OFF */}
                {!config.autoSmartGimbal && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                    {config.pattern === 'combo_3dgs' ? (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-cyan-300 font-medium">
                              Fase 1 · Gimbal Órbita Interna (°)
                            </span>
                            <span className="font-mono font-semibold text-slate-100 tabular-nums">
                              {config.orbitInnerGimbal}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-90}
                            max={-15}
                            step={1}
                            value={config.orbitInnerGimbal}
                            onChange={(e) =>
                              onChangeConfig((prev) => ({
                                ...prev,
                                orbitInnerGimbal: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-300 font-medium">
                              Fase 2 · Gimbal Grilla Central (°)
                            </span>
                            <span className="font-mono font-semibold text-slate-100 tabular-nums">
                              {config.gimbalPitch}°{' '}
                              {config.gimbalPitch === -90 ? '(Nadir)' : '(Oblicuo)'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-90}
                            max={-15}
                            step={1}
                            value={config.gimbalPitch}
                            onChange={(e) =>
                              onChangeConfig((prev) => ({
                                ...prev,
                                gimbalPitch: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-amber-300 font-medium">
                              Fase 3 · Gimbal Órbita Externa (°)
                            </span>
                            <span className="font-mono font-semibold text-slate-100 tabular-nums">
                              {config.orbitOuterGimbal}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-90}
                            max={-15}
                            step={1}
                            value={config.orbitOuterGimbal}
                            onChange={(e) =>
                              onChangeConfig((prev) => ({
                                ...prev,
                                orbitOuterGimbal: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">
                            Ángulo de Gimbal Manual (°)
                          </span>
                          <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                            {config.gimbalPitch}°{' '}
                            {config.gimbalPitch === -90 ? '(Nadir)' : '(Oblicuo)'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-90}
                          max={0}
                          step={1}
                          value={config.gimbalPitch}
                          onChange={(e) =>
                            onChangeConfig((prev) => ({
                              ...prev,
                              gimbalPitch: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Rumbo de Grilla (°)</span>
                  <span className="font-mono font-semibold text-amber-300 tabular-nums">
                    {config.gridAngle}°
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={config.gridAngle}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        gridAngle: Number(e.target.value),
                      }))
                    }
                    className="flex-1 accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <button
                    type="button"
                    disabled={polygon.length < 3}
                    onClick={onOptimizeGridAngle}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 text-sky-300 border border-sky-500/30 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Auto-Optimizar</span>
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* =========================================================
            TAB 2: DRONE (DJI AIR 3S) & OPCIONES DE TRAZADO
        ========================================================= */}
        {activeTab === 'drone' && (
          <>
            {/* Camera / Payload Selector */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  Cámara / Payload (DJI Air 3S por defecto)
                </h3>
                <Camera className="w-3.5 h-3.5 text-sky-400" />
              </div>

              <select
                value={config.payloadId}
                onChange={(e) => {
                  const newId = e.target.value as DronePayloadId;
                  const spec = DRONE_PAYLOADS[newId];
                  onChangeConfig((prev) => ({
                    ...prev,
                    payloadId: newId,
                    shutterSpeedDenom: spec.defaultShutterDenom,
                  }));
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {Object.values(DRONE_PAYLOADS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Sensor Spec Sheet */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 text-[11px]">
                <div className="text-sky-300 font-medium">
                  {currentPayload.sensorDesc}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-slate-400 font-mono">
                  <div>
                    Huella @ {config.altitude}m:{' '}
                    <span className="text-slate-200">
                      {metrics.footprintWidthM.toFixed(1)}×
                      {metrics.footprintHeightM.toFixed(1)}m
                    </span>
                  </div>
                  <div>
                    Intervalo mín SD:{' '}
                    <span className="text-emerald-300">
                      {currentPayload.minIntervalSec.toFixed(1)}s
                    </span>
                  </div>
                  <div>
                    Obturador:{' '}
                    <span className="text-slate-200">
                      {currentPayload.shutterType === 'Electronic'
                        ? 'Electrónico'
                        : 'Mecánico'}
                    </span>
                  </div>
                  <div>
                    WPML Enum:{' '}
                    <span className="text-slate-200">
                      #{currentPayload.wpmlDroneEnumValue}/
                      {currentPayload.wpmlPayloadEnumValue}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* Intervalometer & Capture Format Controls (Air 3S) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  Modo de Intervalo de Disparo (Segundos)
                </h3>
                <Timer className="w-3.5 h-3.5 text-cyan-400" />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2.5">
                {/* Auto vs Manual Interval Toggle */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        intervalMode: 'auto',
                      }))
                    }
                    className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      config.intervalMode === 'auto'
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Auto (Por Solape y V)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        intervalMode: 'manual',
                      }))
                    }
                    className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      config.intervalMode === 'manual'
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Manual (Cada X seg)
                  </button>
                </div>

                {config.intervalMode === 'auto' ? (
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        Intervalo Exacto ($t = d/V$):
                      </span>
                      <span className="font-mono font-bold text-sky-300 tabular-nums">
                        {metrics.photoIntervalS.toFixed(2)} s (c/ {metrics.photoStepM.toFixed(1)}m)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        Intervalo Nativo DJI Air 3S:
                      </span>
                      <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                        {metrics.djiNativeIntervalS} s (WPML multipleTiming)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Disparo Fijo cada $X$ Segundos:
                      </span>
                      <div className="flex items-center gap-1 font-mono">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          step={0.5}
                          value={config.customIntervalSec}
                          onChange={(e) =>
                            onChangeConfig((prev) => ({
                              ...prev,
                              customIntervalSec: Math.max(
                                1,
                                Math.min(60, Number(e.target.value) || 2)
                              ),
                            }))
                          }
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-cyan-300 font-bold text-xs"
                        />
                        <span className="text-slate-400">seg</span>
                      </div>
                    </div>

                    {/* Quick Native DJI Fly Interval Buttons */}
                    <div className="grid grid-cols-7 gap-1">
                      {DJI_INTERVAL_PRESETS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() =>
                            onChangeConfig((prev) => ({
                              ...prev,
                              customIntervalSec: sec,
                            }))
                          }
                          className={`py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer ${
                            config.customIntervalSec === sec
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>

                    {/* Resulting Front Overlap Calculation & Warning */}
                    <div
                      className={`p-2 rounded border text-[11px] space-y-1 ${
                        metrics.lowOverlapWarning
                          ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>Solapamiento Frontal Real Resultante:</span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            metrics.lowOverlapWarning
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                          }`}
                        >
                          {metrics.effectiveFrontOverlapPct.toFixed(1)}% (c/{' '}
                          {metrics.effectivePhotoStepM.toFixed(1)}m)
                        </span>
                      </div>
                      {metrics.lowOverlapWarning && (
                        <div className="flex items-start gap-1.5 text-[10px] text-amber-300 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            Atención: Con {config.customIntervalSec}s a{' '}
                            {config.speed.toFixed(1)} m/s el solape frontal cae por debajo del 70% recomendado. Reduce el intervalo o baja la velocidad.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Generated Selector (includes multipleTiming Intervalometer) */}
                <div className="space-y-1 pt-1 border-t border-slate-800/80">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Acción en Waypoints (.KMZ WPML 3.0)
                  </label>
                  <select
                    value={config.waypointAction}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        waypointAction: e.target.value as WaypointAction,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="intervalTimer">
                      ⏱️ Intervalómetro Continuo (Cada{' '}
                      {config.intervalMode === 'manual'
                        ? config.customIntervalSec
                        : metrics.djiNativeIntervalS}{' '}
                      seg · multipleTiming)
                    </option>
                    <option value="takePhoto">
                      📸 Tomar Foto en cada Waypoint (reachPoint takePhoto)
                    </option>
                    <option value="noAction">
                      Sin Acción (noAction — Control manual en DJI Fly)
                    </option>
                    <option value="recordVideo">
                      🎥 Video Continuo 4K (startRecord en WP#1 y stopRecord al final)
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* microSD Card Storage Calculator (MB / GB) */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  💾 Almacenamiento Estimado SD (Air 3S)
                </h3>
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-slate-400">
                  Formato de Archivo de Captura (Air 3S)
                </label>
                <select
                  value={config.captureFormat}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      captureFormat: e.target.value as CaptureFormatId,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="jpeg">
                    JPEG (Estándar) — 6.5 MB/foto (12MP) | 22 MB/foto (50MP)
                  </option>
                  <option value="raw">
                    RAW (DNG) — 24 MB/foto (12MP) | 98 MB/foto (50MP)
                  </option>
                  <option value="jpeg_raw">
                    JPEG + RAW (DNG) — 30.5 MB/foto (12MP) | 120 MB/foto (50MP)
                  </option>
                  <option value="video_4k60">
                    Video 4K 60fps 10-bit (D-Log M / 3DGS) — 130 Mbps (~975 MB/min)
                  </option>
                </select>
              </div>

              {/* Storage Telemetry Card */}
              <div className="p-2.5 rounded-lg bg-slate-950/90 border border-emerald-500/30 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-sans">
                  <span>Peso Unitario Activo:</span>
                  <span className="font-mono text-sky-300 font-medium">
                    {metrics.storagePerUnitLabel}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Total Misión
                    </span>
                    <span className="text-xs font-bold text-emerald-300 tabular-nums">
                      {metrics.totalStorageMB >= 1024
                        ? `${metrics.totalStorageGB.toFixed(2)} GB`
                        : `${metrics.totalStorageMB.toFixed(0)} MB`}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {metrics.estimatedPhotos} fotos
                    </span>
                  </div>

                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Por Batería
                    </span>
                    <span className="text-xs font-bold text-sky-300 tabular-nums">
                      {metrics.storagePerBatteryMB >= 1024
                        ? `${(metrics.storagePerBatteryMB / 1024).toFixed(2)} GB`
                        : `${metrics.storagePerBatteryMB.toFixed(0)} MB`}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      /{metrics.batteriesRequired || 1} bat
                    </span>
                  </div>

                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Escritura SD
                    </span>
                    <span className="text-xs font-bold text-amber-300 tabular-nums">
                      {metrics.requiredWriteSpeedMBps.toFixed(1)} MB/s
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {metrics.requiredWriteSpeedMBps > 30 ? 'U3 / V60+' : 'U3 / V30'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* WaypointMap Pro Practical Controls */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Opciones Prácticas de Trazado (WaypointMap Pro)
              </h3>

              {/* Generate Every Point Toggle */}
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-200">
                    Generar Todos los Puntos (Generate Every Point)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        generateEveryPoint: !prev.generateEveryPoint,
                      }))
                    }
                    className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${
                      config.generateEveryPoint
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {config.generateEveryPoint ? 'ON (Densificado)' : 'OFF (Ligero RC 2)'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {config.generateEveryPoint
                    ? 'ON: Crea un waypoint en cada disparo de cámara a lo largo de las calles.'
                    : 'OFF (Recomendado DJI Fly): En las rectas de la grilla genera solo los 2 extremos por pasada para optimizar memoria del DJI RC 2, manteniendo todos los puntos en órbitas.'}
                </p>
              </div>

              {/* Trajectory Switches */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      Invertir Ruta (Reverse Flight Path)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Invierte el orden de principio a fin (WP#1 ↔ Final)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.reversePath}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        reversePath: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      Enderezar Líneas (Straighten Flight Paths)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Fuerza líneas rectas limpias sin curvas parásitas WPML
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.straightenPaths}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        straightenPaths: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </label>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Mountain className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-xs font-medium text-slate-200 block">
                          Corrección Dinámica de Terreno (AGL)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Ajusta altitud WP según desnivel respecto al despegue
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.terrainFollowAGL}
                      onChange={(e) =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          terrainFollowAGL: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                  </label>
                  {config.terrainFollowAGL && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                      <span className="text-emerald-300 font-mono">
                        {isFetchingTerrain
                          ? 'Consultando Open-Elevation API...'
                          : 'Altitudes AGL compensadas activas'}
                      </span>
                      <button
                        type="button"
                        onClick={onRefreshTerrain}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Recalcular</span>
                      </button>
                    </div>
                  )}
                </div>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      Modo Alta Precisión (High Accuracy Anchor)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Añade 2 waypoints previos para estabilizar rumbo y gimbal
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.highAccuracyAnchor}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        highAccuracyAnchor: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                  />
                </label>
              </div>
            </section>
          </>
        )}

        {/* =========================================================
            TAB 3: FÍSICA ÓPTICA, SEGURIDAD & RELEVO MULTI-BATERÍA
        ========================================================= */}
        {activeTab === 'physics' && (
          <>
            {/* Electronic Shutter & Motion Blur Analysis */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  Física de Obturador Electrónico (Air 3S)
                </h3>
                <Gauge className="w-4 h-4 text-sky-400" />
              </div>

              <div className="flex items-center justify-between text-xs bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-slate-300">Velocidad de Obturación</span>
                <select
                  value={config.shutterSpeedDenom}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      shutterSpeedDenom: Number(e.target.value),
                    }))
                  }
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-sky-300"
                >
                  <option value={500}>1/500 s (Nublado)</option>
                  <option value={800}>1/800 s (Estándar Air 3S)</option>
                  <option value={1000}>1/1000 s (Día Soleado)</option>
                  <option value={1600}>1/1600 s (Alta Luz)</option>
                </select>
              </div>

              {/* Blur & Interval Diagnostic Cards */}
              <div className="grid grid-cols-2 gap-2.5 font-mono">
                <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Motion Blur (1/{config.shutterSpeedDenom}s)
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      metrics.blurWarning === 'critical'
                        ? 'text-rose-400'
                        : metrics.blurWarning === 'warning'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {metrics.motionBlurPx.toFixed(2)} px
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {metrics.motionBlurMm.toFixed(2)} mm en terreno
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Intervalo Activo ({config.intervalMode === 'manual' ? 'Manual' : 'Auto'})
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      metrics.intervalWarning === 'critical'
                        ? 'text-rose-400'
                        : metrics.intervalWarning === 'warning'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {metrics.effectiveIntervalSec.toFixed(1)} s
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {metrics.estimatedPhotos} fotos · Mín SD: {currentPayload.minIntervalSec.toFixed(1)}s
                  </span>
                </div>
              </div>

              {metrics.intervalWarning !== 'ok' ||
              metrics.blurWarning !== 'ok' ? (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">
                        Alerta de Buffer SD o Desenfoque por Movimiento
                      </span>
                      <span className="text-[11px] text-amber-300/90">
                        {metrics.intervalWarning !== 'ok'
                          ? `Intervalo (${metrics.effectiveIntervalSec.toFixed(
                              1
                            )}s) menor al mínimo seguro SD (${
                              currentPayload.minIntervalSec
                            }s). `
                          : ''}
                        {metrics.blurWarning !== 'ok'
                          ? `Motion Blur (${metrics.motionBlurPx.toFixed(
                              2
                            )} px) supera 1.0 px.`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoAdjustSpeed}
                    className="w-full py-1.5 px-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>
                      Auto-Ajustar Velocidad Segura ({metrics.recommendedMaxSpeedMs}{' '}
                      m/s)
                    </span>
                  </button>
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-2 text-[11px] text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Parámetros ópticos óptimos: buffer SD seguro y Motion Blur &lt; 0.8 px.
                  </span>
                </div>
              )}

              {/* Compact SD Card Storage Summary in Tab 3 */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-slate-200 font-semibold block">
                      💾 Almacenamiento Estimado SD
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {metrics.estimatedPhotos} fotos · {metrics.requiredWriteSpeedMBps.toFixed(1)} MB/s
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs font-bold text-emerald-300 block tabular-nums">
                    {metrics.totalStorageMB >= 1024
                      ? `${metrics.totalStorageGB.toFixed(2)} GB`
                      : `${metrics.totalStorageMB.toFixed(0)} MB`}
                  </span>
                  <span className="text-[10px] text-sky-300 tabular-nums">
                    ~{metrics.storagePerBatteryMB.toFixed(0)} MB/bat
                  </span>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* Oblique Look-Ahead Offset */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">
                Compensación Oblicua (Look-Ahead @ {config.altitude}m)
              </h3>
              <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-cyan-400">Gimbal -75°</div>
                  <div className="font-semibold text-slate-100 tabular-nums mt-0.5">
                    +{metrics.lookAhead75M.toFixed(1)} m
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-sky-400">Gimbal -60°</div>
                  <div className="font-semibold text-slate-100 tabular-nums mt-0.5">
                    +{metrics.lookAhead60M.toFixed(1)} m
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-amber-400">Gimbal -45°</div>
                  <div className="font-semibold text-slate-100 tabular-nums mt-0.5">
                    +{metrics.lookAhead45M.toFixed(1)} m
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-800" />

            {/* Real Air 3S Battery Management & Smart RTH Continuity */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  Gestión de Relevo de Baterías & Reanudación
                </h3>
                <BatteryCharging className="w-4 h-4 text-amber-400" />
              </div>

              {/* Battery Autonomy Presets */}
              <div className="grid grid-cols-3 gap-1.5">
                {Object.values(BATTERY_PRESETS).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        batteryPreset: preset.id,
                      }))
                    }
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      config.batteryPreset === preset.id
                        ? 'bg-sky-500/15 border-sky-500/60 text-slate-100'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono font-bold text-xs text-sky-300">
                      {preset.minutes} min
                    </div>
                    <div className="text-[10px] text-slate-300 truncate">
                      {preset.id === 'wind_28'
                        ? 'Viento'
                        : preset.id === 'optimal_30'
                        ? 'Óptimo'
                        : 'Máximo'}
                    </div>
                  </button>
                ))}
              </div>

              {/* Map RTH Lines Switch & Resume Overlap Selector */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-medium text-slate-200">
                      Mostrar Líneas de Relevo RTH en Mapa
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showRthLines}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        showRthLines: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-300 font-medium block">
                      Solape de Reanudación
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Retroceso al retomar siguiente batería
                    </span>
                  </div>
                  <select
                    value={config.resumeOverlapWaypoints}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        resumeOverlapWaypoints: Number(e.target.value),
                      }))
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-[11px] text-amber-300"
                  >
                    <option value={1}>1 WP antes del corte (Ideal)</option>
                    <option value={0}>Mismo WP de corte (0 WP)</option>
                    <option value={2}>2 WP antes del corte</option>
                  </select>
                </div>
              </div>

              {/* Sub-Missions Breakdown & 1-Click Independent KMZ Export */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Desglose por Batería (Ida + Misión + RTH)
                  </span>
                  <span className="font-mono text-amber-300 font-bold">
                    {metrics.batteriesRequired || 1} Bat
                  </span>
                </div>

                {waypoints.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Dibuja o carga una misión para calcular los puntos de corte RTH.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {metrics.batterySegments.map((seg) => (
                      <div
                        key={seg.batteryNumber}
                        className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-sky-300">
                            🔋 Bat #{seg.batteryNumber}: WP #{seg.startWaypointId} → #
                            {seg.endWaypointId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadSegmentKmz(seg)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-[11px] cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>.KMZ Bat #{seg.batteryNumber}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400">
                          <div>
                            Ida:{' '}
                            <span className="text-cyan-300">
                              {formatDurationShort(seg.transitInTimeS)}
                            </span>
                          </div>
                          <div>
                            Misión:{' '}
                            <span className="text-emerald-300">
                              {formatDurationShort(seg.missionTimeS)}
                            </span>
                          </div>
                          <div>
                            RTH:{' '}
                            <span className="text-amber-300">
                              {formatDurationShort(seg.rthOutTimeS)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5 border-t border-slate-800/60">
                          <span>
                            Captura: <strong className="text-slate-200">{seg.estimatedSegmentPhotos} fotos</strong>
                          </span>
                          <span className="text-emerald-300">
                            💾{' '}
                            {seg.estimatedSegmentStorageMB >= 1024
                              ? `${(seg.estimatedSegmentStorageMB / 1024).toFixed(2)} GB`
                              : `${seg.estimatedSegmentStorageMB.toFixed(0)} MB`}
                          </span>
                        </div>

                        {seg.resumeNextStartWaypointId !== null && (
                          <div className="text-[10px] text-amber-300/90 font-mono">
                            Corte RTH en WP #{seg.cutWaypointId} · Bat #
                            {seg.batteryNumber + 1} retoma en WP #
                            {seg.resumeNextStartWaypointId}
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleDownloadFullKmz}
                      className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                      <span>
                        Exportar Misión Completa Única ({waypoints.length} WP)
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Emergency Field Resume Control ("Reanudar Misión desde Waypoint #") */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Reanudar en Terreno desde Waypoint #</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-100">
                    WP #{safeResumeWpId} → #{waypoints.length || 1}
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Si aterrizaste por viento o emergencia en un punto intermedio, selecciona el waypoint aquí para exportar un <code className="text-emerald-300">.KMZ</code> desde ese punto hasta el final.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, waypoints.length)}
                    step={1}
                    disabled={waypoints.length === 0}
                    value={safeResumeWpId}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        resumeFromWaypointId: Number(e.target.value),
                      }))
                    }
                    className="flex-1 accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, waypoints.length)}
                    disabled={waypoints.length === 0}
                    value={safeResumeWpId}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        resumeFromWaypointId: Math.max(
                          1,
                          Math.min(
                            Math.max(1, waypoints.length),
                            Number(e.target.value) || 1
                          )
                        ),
                      }))
                    }
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-right font-mono text-xs text-emerald-300 font-bold"
                  />
                </div>

                <button
                  type="button"
                  disabled={waypoints.length === 0}
                  onClick={handleDownloadEmergencyResume}
                  className="w-full py-1.5 px-3 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    Exportar .KMZ desde WP #{safeResumeWpId} al Final
                  </span>
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};
