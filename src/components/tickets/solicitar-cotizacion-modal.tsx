"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearCotizacionSchema, type CrearCotizacionInput } from "@/lib/zod/ticket.schema";
import { crearCotizacion } from "@/server/actions/tickets/crear-cotizacion";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function SolicitarCotizacionModal({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearCotizacionInput>({
    resolver: zodResolver(crearCotizacionSchema),
    defaultValues: { ticketId, monto: undefined, descripcion: "" },
  });

  async function onSubmit(values: CrearCotizacionInput) {
    setError(null);
    try {
      await crearCotizacion(values);
      reset({ ticketId, monto: undefined, descripcion: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full">
        Solicitar cotización adicional
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Solicitar cotización">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Monto (S/)</label>
            <input type="number" step="0.01" {...register("monto")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="150.00" />
            {errors.monto && <p className="mt-1 text-xs text-red-600">{errors.monto.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">¿Qué cubre este costo adicional?</label>
            <textarea
              {...register("descripcion")}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Reemplazo de fuente de poder, no cubierta por el contrato actual..."
            />
            {errors.descripcion && <p className="mt-1 text-xs text-red-600">{errors.descripcion.message}</p>}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Enviando..." : "Enviar al cliente"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
