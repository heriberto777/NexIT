"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearContratoSchema, type CrearContratoInput } from "@/lib/zod/admin.schema";
import { crearContrato } from "@/server/actions/admin/crear-contrato";
import { Button } from "@/components/ui/button";

// Minutos de referencia iniciales por prioridad (los mismos valores de ejemplo que usa
// prisma/seed.ts) — el admin los ajusta según el contrato real, no parte de cero.
const SLAS_INICIALES = [
  { prioridad: "CRITICA" as const, tiempoRespuestaMin: 60, tiempoResolucionMin: 240 },
  { prioridad: "ALTA" as const, tiempoRespuestaMin: 120, tiempoResolucionMin: 480 },
  { prioridad: "MEDIA" as const, tiempoRespuestaMin: 240, tiempoResolucionMin: 1440 },
  { prioridad: "BAJA" as const, tiempoRespuestaMin: 480, tiempoResolucionMin: 2880 },
];

const ETIQUETA_PRIORIDAD: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };

export function NuevaContratoForm({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearContratoInput>({
    resolver: zodResolver(crearContratoSchema),
    defaultValues: { clienteId, tipoContrato: "", fechaInicio: "", fechaFin: "", slas: SLAS_INICIALES },
  });

  async function onSubmit(values: CrearContratoInput) {
    setError(null);
    const resultado = await crearContrato(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    reset({ clienteId, tipoContrato: "", fechaInicio: "", fechaFin: "", slas: SLAS_INICIALES });
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAbierto(true)}>
        + Nuevo contrato
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de contrato</label>
          <input
            {...register("tipoContrato")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Soporte integral - Plan Oro"
          />
          {errors.tipoContrato && <p className="mt-1 text-xs text-red-600">{errors.tipoContrato.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de inicio</label>
          <input type="date" {...register("fechaInicio")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.fechaInicio && <p className="mt-1 text-xs text-red-600">{errors.fechaInicio.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de fin (opcional)</label>
          <input type="date" {...register("fechaFin")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Horas incluidas (opcional)</label>
          <input
            type="number"
            min={0}
            {...register("horasIncluidas")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">SLA por prioridad (minutos)</label>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Prioridad</th>
                <th className="px-3 py-2 font-medium">Tiempo de respuesta</th>
                <th className="px-3 py-2 font-medium">Tiempo de resolución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SLAS_INICIALES.map((sla, i) => (
                <tr key={sla.prioridad}>
                  <td className="px-3 py-2 font-medium text-gray-700">{ETIQUETA_PRIORIDAD[sla.prioridad]}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      {...register(`slas.${i}.tiempoRespuestaMin`)}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      {...register(`slas.${i}.tiempoResolucionMin`)}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.slas && <p className="mt-1 text-xs text-red-600">Revisá los valores de SLA.</p>}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Guardando..." : "Guardar contrato"}
        </Button>
      </div>
    </form>
  );
}
