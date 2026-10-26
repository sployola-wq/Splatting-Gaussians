import React from 'react';
import {
  Cpu,
  Mail,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UserCheck,
  X,
  Code2,
} from 'lucide-react';

export type AppTheme = 'dark' | 'light';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  onChangeTheme: (newTheme: AppTheme) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onChangeTheme,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Configuración y Acerca de la Aplicación
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6 text-xs overflow-y-auto max-h-[82vh]">
          {/* Section 1: Theme Selector (Modo Claro / Modo Oscuro) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200">
                Apariencia de la Interfaz (Tema Visual)
              </h3>
              <span className="text-[11px] font-mono text-sky-400">
                {theme === 'dark' ? 'Modo Oscuro Activo' : 'Modo Claro Activo'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Selecciona el esquema de color para el panel de control, modales y telemetría flotante sobre el lienzo. Tu preferencia se guarda automáticamente.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-sky-500/15 border-sky-500 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    theme === 'dark'
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs block text-slate-100">
                    Modo Oscuro
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Aviónica Nocturna (Por defecto)
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-sky-500/15 border-sky-500 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    theme === 'light'
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs block text-slate-100">
                    Modo Claro
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Alto Contraste Diurno / Terreno
                  </span>
                </div>
              </button>
            </div>
          </section>

          <div className="h-px bg-slate-800" />

          {/* Section 2: Official Credits / About the App */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200">
                About / Acerca de la App (Créditos Oficiales)
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                WPML 3.0 · 3DGS Studio
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
              {/* Studio Identity Header */}
              <div className="flex items-center gap-3.5 pb-3 border-b border-slate-800/80">
                <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                  <Code2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-100">
                    SPLS-Lab Dev
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Ingeniería Geomática, Fotogrametría Aérea &amp; 3D Gaussian Splatting
                  </div>
                </div>
              </div>

              {/* Official Metadata Grid */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    <span>Developer / Studio:</span>
                  </span>
                  <span className="font-semibold text-slate-100 font-mono">
                    SPLS-Lab Dev
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Lead Architect / Created by:</span>
                  </span>
                  <span className="font-semibold text-slate-100">
                    Sergio Loyola
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-amber-400" />
                    <span>Engine / Core:</span>
                  </span>
                  <span className="font-medium text-sky-300 font-mono text-[11px]">
                    Powered by Google Gemini / Vertex AI
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                    <span>E-mail:</span>
                  </span>
                  <a
                    href="mailto:contacto@argodrone.cl"
                    className="font-mono font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
                  >
                    contacto@argodrone.cl
                  </a>
                </div>
              </div>

              {/* Copyright Footer */}
              <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>© 2026 Argodrone. All rights reserved.</span>
                <span className="font-mono text-[10px] text-slate-500">
                  Build 2026 · Chile
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
