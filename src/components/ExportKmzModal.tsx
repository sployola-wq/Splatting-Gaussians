import React, { useState } from 'react';
import {
  BatteryCharging,
  Download,
  Layers,
  Navigation,
  Play,
  Scissors,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  BatterySegment,
  ImportedMissionMeta,
  MissionConfig,
  MissionMetrics,
  MissionWaypoint,
} from '../types/mission';
import {
  exportBatterySegmentKmz,
  exportDjiKmz,
  exportEmergencyResumeKmz,
} from '../utils/wpmlEngine';

interface ExportKmzModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: MissionWaypoint[];
  config: MissionConfig;
  onChangeConfig: (updater: (prev: MissionConfig) => MissionConfig) => void;
  metrics: MissionMetrics;
  meta: ImportedMissionMeta | null;
}

export const ExportKmzModal: React.FC<ExportKmzModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  config,
  onChangeConfig,
  metrics,
  meta,
}) => {
  const [exportMode, setExportMode] = useState<'single' | 'split_battery' | 'emergency_resume'>(
    metrics.batterySegments.length > 1 ? 'split_battery' : 'single'
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const handleExportFullSingle = async () => {
    await exportDjiKmz(
      waypoints,
      config,
      metrics.totalDistanceM,
      metrics.totalFlightTimeS,
      meta
    );
    setStatusMessage(
      `Misión completa exportada (${waypoints.length} waypoints en un único archivo .KMZ).`
    );
  };

  const handleExportBatteryPart = async (seg: BatterySegment) => {
    const fileName = await exportBatterySegmentKmz(seg, config, meta);
    setStatusMessage(
      `Exportada Sub-Misión Batería #${seg.batteryNumber}: ${fileName} (${seg.waypointCount} waypoints re-indexados desde 0).`
    );
  };

  const handleExportAllBatteryParts = async () => {
    for (const seg of metrics.batterySegments) {
      await exportBatterySegmentKmz(seg, config, meta);
      await new Promise((r) => setTimeout(r, 250));
    }
    setStatusMessage(
      `Se descargaron las ${metrics.batterySegments.length} sub-misiones .KMZ independientes.`
    );
  };

  const handleExportEmergencyResume = async () => {
    const startWp = Math.max(
      1,
      Math.min(waypoints.length, config.resumeFromWaypointId)
    );
    const fileName = await exportEmergencyResumeKmz(
      waypoints,
      startWp,
      config,
      meta
    );
    setStatusMessage(
      `Misión de reanudación exportada desde WP #${startWp} hasta WP #${waypoints.length}: ${fileName}`
    );
  };

  const safeResumeWpId = Math.max(
    1,
    Math.min(Math.max(1, waypoints.length), config.resumeFromWaypointId)
  );
  const remainingWaypointsCount = Math.max(
    0,
    waypoints.length - safeResumeWpId + 1
  );

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Centro de Exportación DJI WPML 3.0 (.KMZ) · Continuidad Multi-Batería & Reanudación
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* 3 Export Strategy Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setExportMode('single')}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                exportMode === 'single'
                  ? 'bg-sky-500/15 border-sky-500 text-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-100 mb-1">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>1. Misión Completa Única</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Un solo archivo <code className="text-sky-300">.KMZ</code> con todos los waypoints (WP #1 a #{waypoints.length}).
              </p>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('split_battery')}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                exportMode === 'split_battery'
                  ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-100 mb-1">
                <BatteryCharging className="w-4 h-4 text-amber-400" />
                <span>
                  2. Dividir por Batería ({metrics.batterySegments.length} Bat)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Sub-misiones independientes con descuento de RTH y solape de reanudación.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setExportMode('emergency_resume')}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                exportMode === 'emergency_resume'
                  ? 'bg-emerald-500/15 border-emerald-500 text-slate-100'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-100 mb-1">
                <Scissors className="w-4 h-4 text-emerald-400" />
                <span>3. Reanudar desde WP #X</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Corta y exporta al instante desde cualquier waypoint de emergencia hasta el final.
              </p>
            </button>
          </div>

          {/* =================================================
              MODE 1: SINGLE COMPLETE KMZ
          ================================================= */}
          {exportMode === 'single' && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Exportar Misión Completa Única (.KMZ)
                  </h3>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Incluye los {waypoints.length} waypoints continuos. Puedes usar el selector de punto de inicio nativo en DJI Fly o ejecutar de principio a fin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportFullSingle}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar .KMZ Completo ({waypoints.length} WP)</span>
                </button>
              </div>
            </div>
          )}

          {/* =================================================
              MODE 2: SMART BATTERY SPLIT SUB-MISSIONS
          ================================================= */}
          {exportMode === 'split_battery' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-200 block">
                    Solape de Reanudación entre Baterías (Resume Overlap)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    La siguiente batería inicia antes del corte para estabilizar rumbo y gimbal sin dejar huecos 3DGS.
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {[
                    { val: 0, label: 'Mismo WP Corte (0)' },
                    { val: 1, label: '1 WP Antes (Recomendado)' },
                    { val: 2, label: '2 WP Antes' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() =>
                        onChangeConfig((prev) => ({
                          ...prev,
                          resumeOverlapWaypoints: opt.val,
                        }))
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                        config.resumeOverlapWaypoints === opt.val
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Battery Segments List */}
              <div className="space-y-2">
                {metrics.batterySegments.map((seg) => (
                  <div
                    key={seg.batteryNumber}
                    className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs">
                          Batería #{seg.batteryNumber}
                        </span>
                        <span className="font-mono font-semibold text-slate-100">
                          Waypoints #{seg.startWaypointId} → #{seg.endWaypointId}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          ({seg.waypointCount} puntos · Re-indexados 0..
                          {seg.waypointCount - 1})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
                        <span>
                          Ida Base→WP#{seg.startWaypointId}:{' '}
                          <strong className="text-cyan-300">
                            {seg.transitInDistM}m ({formatTime(seg.transitInTimeS)})
                          </strong>
                        </span>
                        <span>
                          Ejecución Misión:{' '}
                          <strong className="text-emerald-300">
                            {seg.missionDistM}m ({formatTime(seg.missionTimeS)})
                          </strong>
                        </span>
                        <span>
                          RTH WP#{seg.endWaypointId}→Base:{' '}
                          <strong className="text-amber-300">
                            {seg.rthOutDistM}m ({formatTime(seg.rthOutTimeS)})
                          </strong>
                        </span>
                        <span>
                          Total Ciclo:{' '}
                          <strong className="text-slate-100">
                            {formatTime(seg.totalSegmentTimeS)} /{' '}
                            {metrics.usableBatteryMinutes}m
                          </strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportBatteryPart(seg)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        Exportar Bat #{seg.batteryNumber} (.KMZ)
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              {metrics.batterySegments.length > 1 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleExportAllBatteryParts}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      Descargar Todas las Sub-Misiones ({metrics.batterySegments.length} archivos .KMZ)
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =================================================
              MODE 3: EMERGENCY FIELD RESUME FROM WAYPOINT #X
          ================================================= */}
          {exportMode === 'emergency_resume' && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span>
                    Reanudar Misión en Terreno desde Waypoint Específico
                  </span>
                </h3>
                <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                  Si tuviste que aterrizar en el Waypoint #42 por viento o imprevisto, selecciona ese punto aquí. Se generará un archivo <code className="text-emerald-300">.KMZ</code> limpio que inicia directamente en el Waypoint seleccionado y continúa hasta el final (#{waypoints.length}).
                </p>
              </div>

              <div className="space-y-2 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 font-medium">
                    Cortar / Iniciar desde Waypoint #:
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-emerald-300 font-bold text-sm">
                      WP #{safeResumeWpId} → WP #{waypoints.length}
                    </span>
                    <span className="text-slate-400 text-xs">
                      ({remainingWaypointsCount} puntos restantes)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, waypoints.length)}
                    step={1}
                    value={safeResumeWpId}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        resumeFromWaypointId: Number(e.target.value),
                      }))
                    }
                    className="flex-1 accent-emerald-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, waypoints.length)}
                    value={safeResumeWpId}
                    onChange={(e) =>
                      onChangeConfig((prev) => ({
                        ...prev,
                        resumeFromWaypointId: Math.max(
                          1,
                          Math.min(
                            waypoints.length,
                            Number(e.target.value) || 1
                          )
                        ),
                      }))
                    }
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-right text-emerald-300 font-bold text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400 font-mono">
                  {config.waypointAction === 'recordVideo'
                    ? '✓ Modo Video 4K: Se inyectará startRecord en el nuevo primer punto y stopRecord al final.'
                    : '✓ Los waypoints restantes se re-indexan desde 0 para ejecución directa en DJI Fly.'}
                </span>
                <button
                  type="button"
                  onClick={handleExportEmergencyResume}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    Exportar .KMZ desde WP #{safeResumeWpId}
                  </span>
                </button>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono">
            finishAction: goHome · executeHeightMode: relativeToStartPoint
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
