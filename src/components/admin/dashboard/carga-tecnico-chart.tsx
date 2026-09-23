"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface CargaTecnico {
  tecnico: string;
  activos: number;
  resueltosUltimos30Dias: number;
}

export function CargaTecnicoChart({ data }: { data: CargaTecnico[] }) {
  // Altura variable: con muchos técnicos, cada barra necesita su propio espacio para
  // no quedar amontonada (28px por fila + margen fijo para ejes/leyenda).
  const altura = Math.max(220, data.length * 44 + 60);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Carga por técnico</h2>
      <p className="mb-3 text-xs text-gray-400">Tickets activos asignados ahora mismo, vs. resueltos en los últimos 30 días.</p>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No hay técnicos con tickets asignados.</p>
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis type="category" dataKey="tecnico" width={110} tick={{ fontSize: 11, fill: "#6b7280" }} />
            <Tooltip cursor={{ fill: "#f9fafb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="activos" name="Activos ahora" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="resueltosUltimos30Dias" name="Resueltos (30 días)" fill="#22c55e" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
