"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function SlaCumplimientoChart({ cumplidos, vencidos }: { cumplidos: number; vencidos: number }) {
  const total = cumplidos + vencidos;
  const porcentaje = total > 0 ? Math.round((cumplidos / total) * 100) : null;
  const data = [
    { nombre: "Dentro de SLA", valor: cumplidos, color: "#16a34a" },
    { nombre: "Fuera de SLA", valor: vencidos, color: "#dc2626" },
  ].filter((d) => d.valor > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Cumplimiento de SLA</h2>
      <p className="mb-3 text-xs text-gray-400">Tickets resueltos/cerrados, tiempo real vs. el tiempo pactado.</p>
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Aún no hay tickets resueltos para medir.</p>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="valor" nameKey="nombre" innerRadius={50} outerRadius={75} paddingAngle={2}>
                {data.map((d) => (
                  <Cell key={d.nombre} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div>
            <p className="text-3xl font-semibold text-gray-900">{porcentaje}%</p>
            <p className="text-xs text-gray-500">dentro del SLA pactado</p>
            <p className="mt-2 text-xs text-gray-400">
              {cumplidos} de {total} tickets resueltos a tiempo
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export interface TiempoResolucionPrioridad {
  prioridad: string;
  horasPromedio: number;
}

const COLOR_PRIORIDAD: Record<string, string> = {
  CRITICA: "#dc2626",
  ALTA: "#f97316",
  MEDIA: "#fbbf24",
  BAJA: "#9ca3af",
};

export function TiempoResolucionChart({ data }: { data: TiempoResolucionPrioridad[] }) {
  const conDatos = data.filter((d) => d.horasPromedio > 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Tiempo promedio de resolución</h2>
      <p className="mb-3 text-xs text-gray-400">Horas, por prioridad (tickets resueltos/cerrados).</p>
      {conDatos.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Aún no hay tickets resueltos para medir.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={conDatos} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} unit="h" />
            <YAxis type="category" dataKey="prioridad" width={64} tick={{ fontSize: 11, fill: "#6b7280" }} />
            <Tooltip cursor={{ fill: "#f9fafb" }} formatter={(v) => [`${Number(v).toFixed(1)} h`, "Promedio"]} />
            <Bar dataKey="horasPromedio" radius={[0, 4, 4, 0]}>
              {conDatos.map((d) => (
                <Cell key={d.prioridad} fill={COLOR_PRIORIDAD[d.prioridad] ?? "#9ca3af"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
