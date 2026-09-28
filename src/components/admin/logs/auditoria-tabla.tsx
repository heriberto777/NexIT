"use client";

import { useState } from "react";
import { TableScroll } from "@/components/ui/table-scroll";

export interface RegistroAuditoriaValue {
  id: string;
  fecha: string;
  usuarioNombre: string;
  usuarioRol: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: string | null;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "medium" });
}

export function AuditoriaTabla({ registros }: { registros: RegistroAuditoriaValue[] }) {
  const [filtro, setFiltro] = useState("");

  const filtrados = registros.filter((r) => {
    if (!filtro.trim()) return true;
    const q = filtro.toLowerCase();
    return (
      r.usuarioNombre.toLowerCase().includes(q) ||
      r.accion.toLowerCase().includes(q) ||
      r.entidad.toLowerCase().includes(q) ||
      (r.detalle ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por usuario, acción, entidad o detalle..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Acción</th>
              <th className="px-3 py-2 font-medium">Entidad</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{formatearFecha(r.fecha)}</td>
                <td className="px-3 py-2 text-gray-700">
                  {r.usuarioNombre}
                  <p className="text-xs text-gray-400">{r.usuarioRol}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{r.accion}</span>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {r.entidad}
                  {r.entidadId && <p className="truncate text-xs text-gray-400" title={r.entidadId}>{r.entidadId}</p>}
                </td>
                <td className="px-3 py-2 text-gray-600">{r.detalle ?? "—"}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">
                  Sin registros de auditoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
