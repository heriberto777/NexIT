"use client";

import { useEffect, useRef, useState } from "react";

export interface EtiquetaOpcion {
  id: string;
  nombre: string;
}

interface Props {
  seleccionadas: string[];
  opciones: EtiquetaOpcion[];
  onChange: (ids: string[]) => void;
}

// Para catálogos chicos de múltiple selección (hoy: especialidades de un técnico) — a
// diferencia de ComboboxBuscable (una sola opción), acá cada elegida queda como chip
// visible con su propia "x", y "+ Agregar" abre la lista de lo que falta por elegir.
export function SelectorEtiquetas({ seleccionadas, opciones, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const elegidas = opciones.filter((o) => seleccionadas.includes(o.id));
  const disponibles = opciones
    .filter((o) => !seleccionadas.includes(o.id))
    .filter((o) => o.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

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

  function agregar(id: string) {
    onChange([...seleccionadas, id]);
    setBusqueda("");
    if (disponibles.length <= 1) setAbierto(false);
  }

  function quitar(id: string) {
    onChange(seleccionadas.filter((s) => s !== id));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {elegidas.map((o) => (
        <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          {o.nombre}
          <button type="button" onClick={() => quitar(o.id)} className="text-blue-400 hover:text-blue-700" aria-label={`Quitar ${o.nombre}`}>
            ×
          </button>
        </span>
      ))}

      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600"
        >
          + Agregar
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
              {disponibles.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => agregar(o.id)} className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                    {o.nombre}
                  </button>
                </li>
              ))}
              {disponibles.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Sin opciones</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
