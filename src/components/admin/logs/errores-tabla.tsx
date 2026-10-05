"use client";

import { useEffect, useState } from "react";

export interface RegistroErrorValue {
  id: string;
  fecha: string;
  origen: string;
  mensaje: string;
  stack: string | null;
  contexto: unknown;
}

interface Props {
  registros: RegistroErrorValue[];
  localeFecha: string;
}

export function ErroresTabla({ registros, localeFecha }: Props) {
  const [filtro, setFiltro] = useState("");
  // Mismo motivo que en AuditoriaTabla: la fecha/hora real (no de calendario) se
  // muestra en la zona horaria del navegador, que nunca coincide con la del servidor
  // (container, UTC) en el primer render — se difiere a después de montar para evitar
  // el hydration mismatch.
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMontado(true));
  }, []);

  function formatearFecha(iso: string): string {
    if (!montado) return "";
    return new Date(iso).toLocaleString(localeFecha, { dateStyle: "short", timeStyle: "medium" });
  }

  const filtrados = registros.filter((r) => {
    if (!filtro.trim()) return true;
    const q = filtro.toLowerCase();
    return r.origen.toLowerCase().includes(q) || r.mensaje.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por origen o mensaje..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="space-y-2">
        {filtrados.map((r) => (
          <details key={r.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
              <span className="text-xs whitespace-nowrap text-gray-500">{formatearFecha(r.fecha)}</span>
              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{r.origen}</span>
              <span className="text-gray-800">{r.mensaje}</span>
            </summary>
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {r.stack && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Stack trace</p>
                  <pre className="overflow-x-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700">{r.stack}</pre>
                </div>
              )}
              {r.contexto != null && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Contexto</p>
                  <pre className="overflow-x-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-700">{JSON.stringify(r.contexto, null, 2)}</pre>
                </div>
              )}
            </div>
          </details>
        ))}
        {filtrados.length === 0 && <p className="rounded-xl border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-400">Sin errores registrados.</p>}
      </div>
    </div>
  );
}
