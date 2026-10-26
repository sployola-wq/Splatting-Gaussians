import React, { useState } from 'react';
import { Code2, Copy, Check, Download, X } from 'lucide-react';
import {
  ImportedMissionMeta,
  MissionConfig,
  MissionMetrics,
  MissionWaypoint,
} from '../types/mission';
import { generateTemplateKml, generateWaylinesWpml } from '../utils/wpmlEngine';

interface WpmlInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: MissionWaypoint[];
  config: MissionConfig;
  metrics: MissionMetrics;
  meta: ImportedMissionMeta | null;
}

export const WpmlInspectorModal: React.FC<WpmlInspectorModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  config,
  metrics,
  meta,
}) => {
  const [activeFile, setActiveFile] = useState<'waylines' | 'template'>(
    'waylines'
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const xmlContent =
    activeFile === 'waylines'
      ? generateWaylinesWpml(
          waypoints,
          config,
          metrics.totalDistanceM,
          metrics.totalFlightTimeS
        )
      : generateTemplateKml(waypoints, config, meta);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadXml = () => {
    const fileName =
      activeFile === 'waylines' ? 'waylines.wpml' : 'template.kml';
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Visor en Vivo DJI WPML 3.0 (Estructura interna .KMZ)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar XML</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadXml}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                Descargar {activeFile === 'waylines' ? 'waylines.wpml' : 'template.kml'}
              </span>
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

        {/* File Switcher Tabs */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFile('waylines')}
              className={`px-3 py-1.5 rounded-md font-mono transition-colors cursor-pointer ${
                activeFile === 'waylines'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              wpmz/waylines.wpml (Ejecutable DJI Fly)
            </button>
            <button
              type="button"
              onClick={() => setActiveFile('template')}
              className={`px-3 py-1.5 rounded-md font-mono transition-colors cursor-pointer ${
                activeFile === 'template'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              wpmz/template.kml (Plantilla Misión)
            </button>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">
            executeHeightMode: relativeToStartPoint · {waypoints.length} Placemarks
          </span>
        </div>

        {/* Code Viewer */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4">
          <pre className="text-[11px] font-mono text-sky-200/90 leading-relaxed whitespace-pre">
            {xmlContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
