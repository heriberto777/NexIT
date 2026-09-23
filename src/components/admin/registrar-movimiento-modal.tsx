"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { registrarMovimientoManualSchema, type RegistrarMovimientoManualInput } from "@/lib/zod/inventario.schema";
import { registrarMovimientoInventario } from "@/server/actions/admin/registrar-movimiento-inventario";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function RegistrarMovimientoModal({ repuestoId }: { repuestoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegistrarMovimientoManualInput>({
    resolver: zodResolver(registrarMovimientoManualSchema),
    defaultValues: { repuestoId, tipo: "ENTRADA", cantidad: 1, motivo: "" },
  });

  const tipo = watch("tipo");

  async function onSubmit(values: RegistrarMovimientoManualInput) {
    setError(null);
    try {
      await registrarMovimientoInventario(values);
      reset({ repuestoId, tipo: "ENTRADA", cantidad: 1, motivo: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + Registrar movimiento
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar movimiento de stock">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
            <select {...register("tipo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="ENTRADA">Entrada (compra / reposición)</option>
              <option value="AJUSTE">Ajuste (corrección de conteo)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Cantidad {tipo === "AJUSTE" && <span className="text-xs text-gray-400">(negativa para restar)</span>}
            </label>
            <input type="number" {...register("cantidad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {errors.cantidad && <p className="mt-1 text-xs text-red-600">{errors.cantidad.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo (opcional)</label>
            <input {...register("motivo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Compra a proveedor X" />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Guardando..." : "Registrar movimiento"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
