import React, { useState } from 'react';
import {
  FileUp,
  FolderOpen,
  Sparkles,
  Usb,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  ImportedMissionMeta,
  LatLng,
  MissionWaypoint,
} from '../types/mission';
import { parseDjiKmzFile, parseWaypointJson } from '../utils/wpmlEngine';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (data: {
    waypoints: MissionWaypoint[];
    polygon: LatLng[];
    inferredAltitude: number;
    inferredSpeed: number;
    meta: ImportedMissionMeta;
  }) => void;
  currentMeta: ImportedMissionMeta | null;
}

const GENERIC_TEMPLATE_JSON = JSON.stringify(
  [
    {
      id: 1,
      Latitude: -33.4505,
      Longitude: -70.65,
      altitude: 70,
      speed: 2.5,
      heading: 0,
      gimbalAngle: -75,
      action: 'noAction',
    },
    {
      id: 2,
      Latitude: -33.45,
      Longitude: -70.6506,
      altitude: 70,
      speed: 2.5,
      heading: 90,
      gimbalAngle: -75,
      action: 'noAction',
    },
    {
      id: 3,
      Latitude: -33.4495,
      Longitude: -70.65,
      altitude: 70,
      speed: 2.5,
      heading: 180,
      gimbalAngle: -75,
      action: 'noAction',
    },
    {
      id: 4,
      Latitude: -33.45,
      Longitude: -70.6494,
      altitude: 70,
      speed: 2.5,
      heading: -90,
      gimbalAngle: -75,
      action: 'noAction',
    },
    {
      id: 5,
      Latitude: -33.4504,
      Longitude: -70.6504,
      altitude: 70,
      speed: 2.5,
      heading: 0,
      gimbalAngle: -90,
      action: 'noAction',
    },
    {
      id: 6,
      Latitude: -33.4496,
      Longitude: -70.6504,
      altitude: 70,
      speed: 2.5,
      heading: 0,
      gimbalAngle: -90,
      action: 'noAction',
    },
    {
      id: 7,
      Latitude: -33.4496,
      Longitude: -70.6496,
      altitude: 70,
      speed: 2.5,
      heading: 180,
      gimbalAngle: -90,
      action: 'noAction',
    },
    {
      id: 8,
      Latitude: -33.4504,
      Longitude: -70.6496,
      altitude: 70,
      speed: 2.5,
      heading: 180,
      gimbalAngle: -90,
      action: 'noAction',
    },
  ],
  null,
  2
);

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  currentMeta,
}) => {
  const [jsonInput, setJsonInput] = useState('');
  const [customFileName, setCustomFileName] = useState(
    currentMeta?.fileName || 'E92A4F10-8C3B-44D1-9A2B-123456789ABC.kmz'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      if (file.name.toLowerCase().endsWith('.kmz')) {
        const parsed = await parseDjiKmzFile(file);
        setCustomFileName(file.name);
        onImportSuccess(parsed);
        onClose();
      } else if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text();
        const parsed = parseWaypointJson(text, file.name);
        onImportSuccess(parsed);
        onClose();
      } else {
        setErrorMsg('Formato no soportado. Sube un archivo .KMZ o .JSON.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error al procesar el archivo.'
      );
    }
  };

  const handleParseJsonText = () => {
    setErrorMsg(null);
    if (!jsonInput.trim()) {
      setErrorMsg('Pega primero un JSON de waypoints válido.');
      return;
    }
    try {
      const parsed = parseWaypointJson(jsonInput, customFileName);
      onImportSuccess(parsed);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'JSON inválido. Verifica el formato de array de waypoints.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Importar Misión (.KMZ / .JSON) y Modo Reemplazo DJI RC 2 / RC-N2
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* USB-C DJI RC 2 Workflow Guide */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-sky-300 font-semibold">
              <Usb className="w-4 h-4" />
              <span>
                Modo "Reemplazar Misión en DJI RC 2 / RC-N2" (vía USB-C)
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              1. Crea una ruta de muestra en tu control remoto DJI Fly y conéctalo por USB-C.
              <br />
              2. Sube aquí el archivo <code className="text-slate-200">.kmz</code> desde{' '}
              <code className="text-sky-300">
                Android/data/dji.go.v5/files/waypoint/[UUID]/[UUID].kmz
              </code>{' '}
              (o escribe su nombre UUID abajo). Al exportar, la aplicación conservará el nombre exacto para pegarlo de vuelta.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="text-slate-300 font-medium whitespace-nowrap">
                Nombre / UUID de salida:
              </span>
              <input
                type="text"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 font-mono text-xs text-amber-300 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* File Dropzone (.KMZ or .JSON) */}
          <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/70 rounded-xl p-5 text-center bg-slate-950/40 transition-colors">
            <FileUp className="w-8 h-8 text-sky-400 mx-auto mb-2" />
            <p className="text-slate-200 font-medium">
              Sube un archivo DJI <span className="font-mono text-sky-300">.KMZ</span> o WaypointMap{' '}
              <span className="font-mono text-emerald-300">.JSON</span>
            </p>
            <p className="text-slate-400 text-[11px] mt-1">
              Detecta automáticamente órbitas (-75° / -45°) y grillas (-90°), dibujando la misión completa en el mapa.
            </p>
            <label className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors">
              <span>Seleccionar Archivo (.KMZ / .JSON)</span>
              <input
                type="file"
                accept=".kmz,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Direct JSON Array Paste */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                O pega directamente el Array JSON (Esquema WaypointMap):
              </label>
              <button
                type="button"
                onClick={() => {
                  setJsonInput(GENERIC_TEMPLATE_JSON);
                  setStatusMsg(
                    'Plantilla JSON genérica cargada en el editor. Haz clic en "Cargar JSON en Mapa".'
                  );
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Insertar Plantilla JSON</span>
              </button>
            </div>

            <textarea
              rows={7}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='[{"altitude":70,"Latitude":-33.4500,"Longitude":-70.6500,"heading":180,"gimbalAngle":-75,"speed":2.5,"id":1,"action":"noAction"}]'
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleParseJsonText}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
          >
            Cargar JSON en Mapa
          </button>
        </div>
      </div>
    </div>
  );
};
