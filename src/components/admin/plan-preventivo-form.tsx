"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { guardarPlanPreventivoSchema, type GuardarPlanPreventivoInput } from "@/lib/zod/plan-preventivo.schema";
import { guardarPlanPreventivo } from "@/server/actions/admin/guardar-plan-preventivo";
import { Button } from "@/components/ui/button";

interface Opcion {
  id: string;
  label: string;
}

interface Props {
  activos: Opcion[];
  sucursales: Opcion[];
  tecnicos: Opcion[];
  valoresIniciales?: GuardarPlanPreventivoInput;
}

const FRECUENCIAS = ["SEMANAL", "MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as const;
const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"] as const;

function aInputDate(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function PlanPreventivoForm({ activos, sucursales, tecnicos, valoresIniciales }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [vinculo, setVinculo] = useState<"activo" | "sucursal">(valoresIniciales?.sucursalId ? "sucursal" : "activo");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardarPlanPreventivoInput>({
    resolver: zodResolver(guardarPlanPreventivoSchema),
    defaultValues: valoresIniciales ?? {
      titulo: "",
      frecuencia: "TRIMESTRAL",
      proximaFecha: "",
      prioridad: "MEDIA",
    },
  });

  async function onSubmit(values: GuardarPlanPreventivoInput) {
    setError(null);
    try {
      // El campo que no corresponde al vínculo elegido no se envía (el schema exige
      // exactamente uno de los dos).
      const payload = vinculo === "activo" ? { ...values, sucursalId: undefined } : { ...values, activoId: undefined };
      await guardarPlanPreventivo(payload);
      router.push("/admin/preventivos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/preventivos" className="text-sm text-blue-600 underline">
        ← Volver a preventivos
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {(errors.activoId || errors.root) && <p className="text-xs text-red-600">{errors.activoId?.message}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Título del plan</label>
          <input {...register("titulo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Mantenimiento trimestral - UPS Sala de Servidores" />
          {errors.titulo && <p className="mt-1 text-xs text-red-600">{errors.titulo.message}</p>}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Aplica a</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={vinculo === "activo"} onChange={() => setVinculo("activo")} /> Un activo específico
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={vinculo === "sucursal"} onChange={() => setVinculo("sucursal")} /> Toda una sede
            </label>
          </div>
        </div>

        {vinculo === "activo" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Activo</label>
            <select {...register("activoId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sucursal</label>
            <select {...register("sucursalId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Frecuencia</label>
            <select {...register("frecuencia")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {FRECUENCIAS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Próxima fecha</label>
            <input
              type="date"
              defaultValue={aInputDate(valoresIniciales?.proximaFecha)}
              {...register("proximaFecha")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.proximaFecha && <p className="mt-1 text-xs text-red-600">{errors.proximaFecha.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Técnico asignado por defecto</label>
            <select {...register("tecnicoAsignadoId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Prioridad del ticket</label>
            <select {...register("prioridad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripción (opcional)</label>
          <textarea {...register("descripcion")} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : "Guardar plan"}
        </Button>
      </form>
    </div>
  );
}
