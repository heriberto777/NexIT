"use client";

import { useEffect, useRef, useState } from "react";

export interface CandidatoAsignado {
  id: string;
  nombre: string;
}

interface Props {
  asignado: CandidatoAsignado | null;
  candidatos: CandidatoAsignado[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

// Mismo patrón visual que SelectorEtiquetas (Colaboradores/Especialidades) — chip con
// "×" para quitar y "+ Agregar" que abre una lista buscable — pero de selección única:
// elegir a alguien de la lista REEMPLAZA el chip en vez de sumarse a él, por eso no se
// reutiliza SelectorEtiquetas tal cual (ahí seleccionadas es siempre un array).
export function SelectorAsignado({ asignado, candidatos, onChange, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const disponibles = candidatos
    .filter((c) => c.id !== asignado?.id)
    .filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    queueMicrotask(() => inputRef.current?.focus());
  }, [abierto]);

  function elegir(candidato: CandidatoAsignado) {
    onChange(candidato.id);
    setAbierto(false);
    setBusqueda("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {asignado && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          {asignado.nombre}
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} className="text-blue-400 hover:text-blue-700" aria-label={`Quitar ${asignado.nombre}`}>
              ×
            </button>
          )}
        </span>
      )}

      {!disabled && (
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600"
          >
            {asignado ? "Cambiar" : "+ Agregar"}
          </button>

          {abierto && (
            <div className="absolute z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
              <input
                ref={inputRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-t-lg border-b border-gray-100 px-3 py-2 text-sm outline-none"
              />
              <ul className="max-h-48 overflow-y-auto py-1">
                {disponibles.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => elegir(c)} className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                      {c.nombre}
                    </button>
                  </li>
                ))}
                {disponibles.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Sin opciones</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
