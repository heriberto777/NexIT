"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLOR_VIGENCIA: Record<string, string> = {
  Vencido: "#dc2626",
  "Próximo a vencer": "#f59e0b",
  Programado: "#22c55e",
};

export interface PreventivosPorVigencia {
  vigencia: "Vencido" | "Próximo a vencer" | "Programado";
  cantidad: number;
}

export function PreventivosChart({ data }: { data: PreventivosPorVigencia[] }) {
  const conDatos = data.filter((d) => d.cantidad > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Preventivos activos</h2>
      <p className="mb-3 text-xs text-gray-400">Planes de mantenimiento preventivo, por vigencia.</p>
      {conDatos.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No hay planes preventivos activos.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={conDatos} dataKey="cantidad" nameKey="vigencia" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {conDatos.map((d) => (
                <Cell key={d.vigencia} fill={COLOR_VIGENCIA[d.vigencia]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
