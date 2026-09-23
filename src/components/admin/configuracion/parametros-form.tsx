"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { guardarParametrosSchema, type GuardarParametrosInput } from "@/lib/zod/configuracion.schema";
import { guardarParametros } from "@/server/actions/admin/configuracion/guardar-parametros";
import { Button } from "@/components/ui/button";

export type ParametrosValues = GuardarParametrosInput;

export function ParametrosForm({ valores }: { valores: ParametrosValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardarParametrosInput>({ resolver: zodResolver(guardarParametrosSchema), defaultValues: valores });

  async function onSubmit(values: GuardarParametrosInput) {
    setError(null);
    setGuardado(false);
    try {
      await guardarParametros(values);
      setGuardado(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Tiempo de resolución por defecto (horas)</p>
        <p className="mb-3 text-xs text-gray-400">
          Se usa solo cuando el ticket no tiene un contrato de SLA propio asignado — un ticket con contrato sigue usando el tiempo pactado con ese cliente.
        </p>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-red-700">Crítica</label>
            <input type="number" {...register("slaHorasCritica")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-orange-700">Alta</label>
            <input type="number" {...register("slaHorasAlta")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-700">Media</label>
            <input type="number" {...register("slaHorasMedia")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Baja</label>
            <input type="number" {...register("slaHorasBaja")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        {(errors.slaHorasCritica || errors.slaHorasAlta || errors.slaHorasMedia || errors.slaHorasBaja) && (
          <p className="mt-1 text-xs text-red-600">Todos los valores deben ser números enteros entre 1 y 720 horas.</p>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">Días de anticipación para preventivos</label>
        <p className="mb-2 text-xs text-gray-400">Ventana por defecto al generar tickets desde planes de mantenimiento preventivo en /admin/preventivos.</p>
        <input type="number" {...register("diasAnticipacionPreventivos")} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {errors.diasAnticipacionPreventivos && <p className="mt-1 text-xs text-red-600">{errors.diasAnticipacionPreventivos.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
