"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoContrato } from "@/server/actions/admin/cambiar-estado-contrato";

const ETIQUETA_PRIORIDAD: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
const ESTILO_ESTADO: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-800",
  VENCIDO: "bg-amber-100 text-amber-800",
  CANCELADO: "bg-gray-200 text-gray-600",
};

interface Sla {
  prioridad: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
  tiempoRespuestaMin: number;
  tiempoResolucionMin: number;
}

interface Props {
  contrato: {
    id: string;
    tipoContrato: string;
    fechaInicio: string;
    fechaFin: string | null;
    horasIncluidas: number | null;
    estado: "ACTIVO" | "VENCIDO" | "CANCELADO";
    slas: Sla[];
  };
  localeFecha: string;
}

export function ContratoCard({ contrato, localeFecha }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState(contrato.estado);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forzar timeZone: "UTC" evita un hydration mismatch real: fechaInicio/fechaFin son
  // fechas de calendario (vienen de un <input type="date">), guardadas como medianoche
  // UTC — sin esto, el servidor (container en UTC) y el navegador (zona horaria local
  // del usuario) calculan días distintos para el mismo instante.
  function formatearFecha(iso: string): string {
    return new Date(iso).toLocaleDateString(localeFecha, { timeZone: "UTC" });
  }

  async function cambiarEstado(nuevoEstado: typeof estado) {
    if (nuevoEstado === estado) return;
    setError(null);
    const anterior = estado;
    setEstado(nuevoEstado); // optimista
    setGuardando(true);
    const resultado = await cambiarEstadoContrato({ id: contrato.id, estado: nuevoEstado });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      setEstado(anterior);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-gray-900">{contrato.tipoContrato}</p>
          <p className="text-xs text-gray-500">
            {formatearFecha(contrato.fechaInicio)} — {contrato.fechaFin ? formatearFecha(contrato.fechaFin) : "sin fecha de fin"}
            {contrato.horasIncluidas != null && ` · ${contrato.horasIncluidas}h incluidas`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[estado]}`}>{estado}</span>
          <select
            value={estado}
            disabled={guardando}
            onChange={(e) => cambiarEstado(e.target.value as typeof estado)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="ACTIVO">Activo</option>
            <option value="VENCIDO">Vencido</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Prioridad</th>
              <th className="px-3 py-2 font-medium">Respuesta</th>
              <th className="px-3 py-2 font-medium">Resolución</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contrato.slas.map((sla) => (
              <tr key={sla.prioridad}>
                <td className="px-3 py-2 text-gray-700">{ETIQUETA_PRIORIDAD[sla.prioridad]}</td>
                <td className="px-3 py-2 text-gray-600">{sla.tiempoRespuestaMin} min</td>
                <td className="px-3 py-2 text-gray-600">{sla.tiempoResolucionMin} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
