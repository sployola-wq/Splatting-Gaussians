import React, { useEffect, useMemo, useState } from 'react';
import {
  Code2,
  Download,
  FolderOpen,
  ListOrdered,
  Play,
  PlusCircle,
  Settings,
  Square,
} from 'lucide-react';
import {
  DEFAULT_MISSION_CONFIG,
  INITIAL_MAP_CENTER,
  INITIAL_MAP_ZOOM,
} from './constants/drones';
import {
  DrawToolMode,
  ImportedMissionMeta,
  LatLng,
  MissionConfig,
  MissionWaypoint,
} from './types/mission';
import {
  buildMission,
  computeCentroid,
  fetchTerrainDeltas,
  findLongestEdgeAngle,
} from './utils/missionEngine';
import { SidebarPanel } from './components/SidebarPanel';
import { MissionMap } from './components/MissionMap';
import { ImportModal } from './components/ImportModal';
import { WaypointTableModal } from './components/WaypointTableModal';
import { WpmlInspectorModal } from './components/WpmlInspectorModal';
import { ExportKmzModal } from './components/ExportKmzModal';
import { AppTheme, SettingsModal } from './components/SettingsModal';

const THEME_STORAGE_KEY = 'spls_air3s_theme';

export default function App() {
  // Theme state persisted in localStorage (defaults to 'dark')
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore storage errors
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark');
    } else {
      root.classList.remove('light-theme');
      root.classList.add('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Clean Start: ZERO forced polygons on startup
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [homePoint, setHomePoint] = useState<LatLng | null>(null);
  const [config, setConfig] = useState<MissionConfig>(DEFAULT_MISSION_CONFIG);
  const [drawMode, setDrawMode] = useState<DrawToolMode>('none');

  // Imported mission override state (for KMZ / JSON replacement workflow)
  const [importedWaypointsOverride, setImportedWaypointsOverride] = useState<
    MissionWaypoint[] | null
  >(null);
  const [importedMeta, setImportedMeta] = useState<ImportedMissionMeta | null>(
    null
  );

  // Terrain AGL Elevation cache
  const [terrainElevationsM, setTerrainElevationsM] = useState<
    Record<number, number>
  >({});
  const [isFetchingTerrain, setIsFetchingTerrain] = useState(false);

  // Simulation & Modals
  const [isSimulating, setIsSimulating] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setExportToast(msg);
    setTimeout(() => setExportToast(null), 4000);
  };

  // Map flyTo controller
  const [flyToTarget, setFlyToTarget] = useState<{
    center: LatLng;
    zoom?: number;
    ts: number;
  } | null>(null);

  // Build Mission Waypoints & Live Photogrammetric Metrics
  const { waypoints, metrics } = useMemo(() => {
    return buildMission(
      polygon,
      homePoint,
      config,
      terrainElevationsM,
      importedWaypointsOverride
    );
  }, [polygon, homePoint, config, terrainElevationsM, importedWaypointsOverride]);

  // Trigger Terrain Elevation Lookup when terrainFollowAGL is enabled
  const refreshTerrainElevations = async () => {
    if (waypoints.length === 0) return;
    setIsFetchingTerrain(true);
    try {
      const refHome = homePoint || waypoints[0];
      const deltas = await fetchTerrainDeltas(refHome, waypoints);
      setTerrainElevationsM(deltas);
    } finally {
      setIsFetchingTerrain(false);
    }
  };

  useEffect(() => {
    if (config.terrainFollowAGL && waypoints.length > 0) {
      refreshTerrainElevations();
    }
  }, [config.terrainFollowAGL, polygon.length]);

  // 1-Click Clean New Project
  const handleNewProject = () => {
    setIsSimulating(false);
    setPolygon([]);
    setHomePoint(null);
    setImportedWaypointsOverride(null);
    setImportedMeta(null);
    setTerrainElevationsM({});
    setDrawMode('none');
    setConfig((prev) => ({ ...prev, resumeFromWaypointId: 1 }));
  };

  // Auto-Optimize Grid Heading along Longest Polygon Edge
  const handleOptimizeGridAngle = () => {
    if (polygon.length < 3) return;
    const bestAngle = findLongestEdgeAngle(polygon);
    setConfig((prev) => ({
      ...prev,
      gridAngle: bestAngle,
    }));
  };

  // Open Export DJI WPML 3.0 .KMZ Modal
  const handleOpenExportModal = () => {
    if (waypoints.length === 0) {
      showToast(
        'Dibuja primero un área en el mapa o importa una misión antes de exportar el .KMZ.'
      );
      return;
    }
    setIsExportModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar (Responsive Header with Settings button & primary actions) */}
      <header className="min-h-13 px-3 sm:px-4 py-1.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 shrink-0 z-30">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setFlyToTarget({
              center: INITIAL_MAP_CENTER,
              zoom: INITIAL_MAP_ZOOM,
              ts: Date.now(),
            });
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          SPLS Air 3S Mission Studio
        </a>

        {/* Zone 2: Concise Workspace Navigation Buttons */}
        <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-medium text-slate-200">
          <button
            type="button"
            onClick={handleNewProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>Nuevo / Limpiar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Importar (.KMZ / .JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (waypoints.length === 0) {
                showToast(
                  'Crea o importa una misión primero para simular el vuelo.'
                );
                return;
              }
              setIsSimulating((prev) => !prev);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isSimulating
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/70 text-slate-200 hover:text-white'
            }`}
          >
            {isSimulating ? (
              <Square className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isSimulating ? 'Detener Sim.' : 'Simular Vuelo'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTableModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
            <span>Tabla Waypoints</span>
          </button>

          <button
            type="button"
            onClick={() => setIsXmlModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Visor XML WPML</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            title="Configuración (Tema Claro/Oscuro) y Acerca de la App"
            aria-label="Configuración"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden xl:inline">Configuración</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleOpenExportModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              Exportar DJI .KMZ
              {metrics.batteriesRequired > 1
                ? ` (${metrics.batteriesRequired} Bat)`
                : ''}
            </span>
          </button>
        </div>
      </header>

      {/* Main Workspace (3-Tab Left Sidebar + High-Performance Canvas Map) */}
      <div className="flex-1 flex min-h-0 relative">
        <SidebarPanel
          config={config}
          onChangeConfig={setConfig}
          metrics={metrics}
          waypoints={waypoints}
          polygon={polygon}
          onOptimizeGridAngle={handleOptimizeGridAngle}
          isFetchingTerrain={isFetchingTerrain}
          onRefreshTerrain={refreshTerrainElevations}
          hasImportedOverride={Boolean(
            importedWaypointsOverride && importedWaypointsOverride.length > 0
          )}
          onReleaseImportedOverride={() => setImportedWaypointsOverride(null)}
          importedMeta={importedMeta}
          onNotifyToast={showToast}
        />

        <MissionMap
          polygon={polygon}
          onChangePolygon={(newPoly) => {
            setImportedWaypointsOverride(null);
            setPolygon(newPoly);
          }}
          homePoint={homePoint}
          onChangeHomePoint={setHomePoint}
          waypoints={waypoints}
          metrics={metrics}
          config={config}
          drawMode={drawMode}
          onChangeDrawMode={setDrawMode}
          onClearAll={handleNewProject}
          isSimulating={isSimulating}
          onToggleSimulation={setIsSimulating}
          flyToTarget={flyToTarget}
        />

        {/* Non-blocking Toast Notification */}
        {exportToast && (
          <div className="absolute top-16 right-5 z-[600] bg-slate-900/95 border border-sky-500/60 text-sky-200 px-4 py-2.5 rounded-lg text-xs font-medium shadow-2xl backdrop-blur-md">
            {exportToast}
          </div>
        )}
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentMeta={importedMeta}
        onImportSuccess={({
          waypoints: impWps,
          polygon: impPoly,
          inferredAltitude,
          inferredSpeed,
          meta,
        }) => {
          setImportedMeta(meta);
          if (impWps.length > 0) {
            setImportedWaypointsOverride(impWps);
            setPolygon(impPoly);
            setConfig((prev) => ({
              ...prev,
              altitude: inferredAltitude,
              speed: inferredSpeed,
              resumeFromWaypointId: 1,
            }));
            const center =
              computeCentroid(impPoly) || {
                lat: impWps[0].lat,
                lng: impWps[0].lng,
              };
            setFlyToTarget({ center, zoom: 17, ts: Date.now() });
            showToast(
              `Misión "${meta.fileName}" importada (${impWps.length} waypoints).`
            );
          } else {
            showToast(
              `Plantilla DJI RC 2 "${meta.fileName}" vinculada para exportación directa.`
            );
          }
        }}
      />

      <WaypointTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        waypoints={waypoints}
      />

      <WpmlInspectorModal
        isOpen={isXmlModalOpen}
        onClose={() => setIsXmlModalOpen(false)}
        waypoints={waypoints}
        config={config}
        metrics={metrics}
        meta={importedMeta}
      />

      <ExportKmzModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        waypoints={waypoints}
        config={config}
        onChangeConfig={setConfig}
        metrics={metrics}
        meta={importedMeta}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        theme={theme}
        onChangeTheme={setTheme}
      />
    </div>
  );
}
