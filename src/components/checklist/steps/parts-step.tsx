"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrarRepuestoSchema, type RegistrarRepuestoInput } from "@/lib/zod/evidencia.schema";
import { Button } from "@/components/ui/button";
import type { RepuestoPlano } from "@/types/ejecucion";

interface Props {
  ticketId: string;
  repuestosDisponibles: RepuestoPlano[];
  repuestosAgregados: { nombre: string; cantidad: number }[];
  isPending: boolean;
  onAgregar: (values: RegistrarRepuestoInput) => void;
  onContinue: () => void;
}

export function PartsStep({
  ticketId,
  repuestosDisponibles,
  repuestosAgregados,
  isPending,
  onAgregar,
  onContinue,
}: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegistrarRepuestoInput>({
    resolver: zodResolver(registrarRepuestoSchema),
    defaultValues: { ticketId, repuestoId: "", cantidad: 1 },
  });

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">4. Repuestos Utilizados</h2>
      <p className="text-xs text-gray-500">Este paso es opcional — sáltalo si no usaste repuestos.</p>

      {repuestosAgregados.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {repuestosAgregados.map((r, i) => (
            <li key={i} className="flex justify-between px-3 py-2 text-sm">
              <span>{r.nombre}</span>
              <span className="text-gray-500">x{r.cantidad}</span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit((values) => {
          onAgregar(values);
          reset({ ticketId, repuestoId: "", cantidad: 1 });
        })}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Repuesto</label>
          <select {...register("repuestoId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Selecciona...</option>
            {repuestosDisponibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} ({r.stockActual} en stock)
              </option>
            ))}
          </select>
          {errors.repuestoId && <p className="mt-1 text-xs text-red-600">{errors.repuestoId.message}</p>}
        </div>
        <div className="w-20">
          <label className="mb-1 block text-xs font-medium text-gray-600">Cant.</label>
          <input
            type="number"
            min={1}
            {...register("cantidad")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          Agregar
        </Button>
      </form>

      <Button type="button" onClick={onContinue} className="w-full">
        Continuar
      </Button>
    </section>
  );
}
