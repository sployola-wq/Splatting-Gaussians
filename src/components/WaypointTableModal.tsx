import React, { useState } from 'react';
import { Download, FileSpreadsheet, ListOrdered, X } from 'lucide-react';
import { MissionWaypoint } from '../types/mission';

interface WaypointTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: MissionWaypoint[];
}

const PHASE_LABELS: Record<string, string> = {
  orbit_inner: 'Órbita Interna (-75°)',
  grid_nadir: 'Grilla Nadir (-90°)',
  grid_cross: 'Grilla Cruzada',
  orbit_outer: 'Órbita Externa (-45°)',
  anchor: 'Ancla Precisión',
  imported: 'Importado WPML',
};

export const WaypointTableModal: React.FC<WaypointTableModalProps> = ({
  isOpen,
  onClose,
  waypoints,
}) => {
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  if (!isOpen) return null;

  const filtered =
    phaseFilter === 'all'
      ? waypoints
      : waypoints.filter((w) => w.phase === phaseFilter);

  const handleDownloadCsv = () => {
    const headers = [
      'id',
      'phase',
      'latitude',
      'longitude',
      'altitude_m',
      'terrain_delta_m',
      'speed_ms',
      'heading_deg',
      'gimbal_pitch_deg',
      'action',
      'battery_index',
      'cumulative_dist_m',
      'cumulative_time_s',
    ];
    const rows = waypoints.map((w) =>
      [
        w.id,
        w.phase,
        w.lat.toFixed(7),
        w.lng.toFixed(7),
        w.altitude.toFixed(1),
        w.terrainDeltaM.toFixed(1),
        w.speed.toFixed(1),
        w.heading.toFixed(1),
        w.gimbalPitch.toFixed(1),
        w.action,
        w.batteryIndex,
        w.cumulativeDistM,
        w.cumulativeTimeS,
      ].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPLS_Air3S_Waypoints_${waypoints.length}wp.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    // Export compatible with WaypointMap JSON schema
    const payload = waypoints.map((w) => ({
      id: w.id,
      Latitude: w.lat,
      Longitude: w.lng,
      altitude: w.altitude,
      speed: w.speed,
      heading: w.heading,
      gimbalAngle: w.gimbalPitch,
      action: w.action,
      phase: w.phase,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPLS_Air3S_Waypoints_${waypoints.length}wp.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <ListOrdered className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Tabla de Waypoints ({filtered.length} de {waypoints.length} puntos)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={waypoints.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Descargar CSV</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              disabled={waypoints.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar JSON (WaypointMap)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Phase Filter Bar */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 mr-2">Filtrar Fase:</span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'orbit_inner', label: 'Fase 1: Órbita -75°' },
            { id: 'grid_nadir', label: 'Fase 2: Grilla -90°' },
            { id: 'orbit_outer', label: 'Fase 3: Órbita -45°' },
            { id: 'imported', label: 'Importados' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPhaseFilter(tab.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                phaseFilter === tab.id
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No hay waypoints generados todavía. Dibuja un polígono en el mapa o usa "Polígono Base (Vista Actual)".
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 sticky top-0 z-10 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-medium">WP #</th>
                  <th className="py-2.5 px-3 font-medium">Fase 3DGS / Misión</th>
                  <th className="py-2.5 px-3 font-medium text-right">Latitud</th>
                  <th className="py-2.5 px-3 font-medium text-right">Longitud</th>
                  <th className="py-2.5 px-3 font-medium text-right">Altitud (m)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Vel (m/s)</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    Rumbo (Yaw)
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">Gimbal</th>
                  <th className="py-2.5 px-3 font-medium">Acción WPML</th>
                  <th className="py-2.5 px-3 font-medium text-right">Dist / Bat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {filtered.map((wp) => (
                  <tr
                    key={wp.id}
                    className="hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-sky-300 tabular-nums">
                      #{wp.id}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-200">
                      {PHASE_LABELS[wp.phase] || wp.phase}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                      {wp.lat.toFixed(6)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                      {wp.lng.toFixed(6)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-100 tabular-nums">
                      {wp.altitude.toFixed(1)}m
                      {wp.terrainDeltaM !== 0 && (
                        <span className="text-[10px] text-emerald-400 ml-1">
                          ({wp.terrainDeltaM > 0 ? '+' : ''}
                          {wp.terrainDeltaM}m)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200 tabular-nums">
                      {wp.speed.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300 tabular-nums">
                      {wp.heading.toFixed(1)}°
                    </td>
                    <td className="py-2 px-3 text-right text-cyan-300 tabular-nums">
                      {wp.gimbalPitch.toFixed(0)}°
                    </td>
                    <td className="py-2 px-3 text-slate-300">{wp.action}</td>
                    <td className="py-2 px-3 text-right text-slate-400 tabular-nums">
                      {wp.cumulativeDistM}m · B{wp.batteryIndex}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
