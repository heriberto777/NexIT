"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Mismos colores que EstadoBadge (src/components/tickets/estado-badge.tsx), en hex
// porque recharts no puede leer clases de Tailwind.
const COLOR_ESTADO: Record<string, string> = {
  ABIERTO: "#3b82f6",
  ASIGNADO: "#6366f1",
  EN_DIAGNOSTICO: "#a855f7",
  ESPERANDO_REPUESTO: "#f59e0b",
  EN_EJECUCION: "#06b6d4",
  ESPERANDO_VALIDACION: "#f97316",
  RESUELTO: "#22c55e",
  REABIERTO: "#ef4444",
  CERRADO: "#9ca3af",
  CANCELADO: "#d1d5db",
};

export interface TicketsPorEstado {
  estado: string;
  cantidad: number;
}

export function TicketsEstadoChart({ data }: { data: TicketsPorEstado[] }) {
  const conLabel = data.map((d) => ({ ...d, label: d.estado.replaceAll("_", " ") }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Tickets por estado</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={conLabel} margin={{ top: 4, right: 8, left: -20, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="label" angle={-35} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip cursor={{ fill: "#f9fafb" }} />
          <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
            {conLabel.map((d) => (
              <Cell key={d.estado} fill={COLOR_ESTADO[d.estado] ?? "#9ca3af"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
