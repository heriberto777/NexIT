"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLOR_PRIORIDAD: Record<string, string> = {
  CRITICA: "#dc2626",
  ALTA: "#f97316",
  MEDIA: "#fbbf24",
  BAJA: "#9ca3af",
};

export interface TicketsPorPrioridad {
  prioridad: string;
  cantidad: number;
}

export function TicketsPrioridadChart({ data }: { data: TicketsPorPrioridad[] }) {
  const conDatos = data.filter((d) => d.cantidad > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Tickets abiertos por prioridad</h2>
      <p className="mb-3 text-xs text-gray-400">Solo tickets en algún estado activo (no resueltos/cerrados/cancelados).</p>
      {conDatos.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No hay tickets abiertos.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={conDatos} dataKey="cantidad" nameKey="prioridad" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {conDatos.map((d) => (
                <Cell key={d.prioridad} fill={COLOR_PRIORIDAD[d.prioridad] ?? "#9ca3af"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
