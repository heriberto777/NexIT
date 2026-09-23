"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { diagnosticoSchema, type DiagnosticoInput } from "@/lib/zod/checklist.schema";
import { Button } from "@/components/ui/button";

interface Props {
  ticketId: string;
  checkedIn: boolean;
  isPending: boolean;
  onCheckIn: (coords?: { latitud: number; longitud: number }) => void;
  onSubmitDiagnostico: (values: DiagnosticoInput) => void;
}

export function CheckInStep({ ticketId, checkedIn, isPending, onCheckIn, onSubmitDiagnostico }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DiagnosticoInput>({
    resolver: zodResolver(diagnosticoSchema),
    defaultValues: { ticketId, hallazgos: "", causaRaizIdentificada: false },
  });

  function handleCheckIn() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onCheckIn();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onCheckIn({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => onCheckIn(),
      { timeout: 5000 },
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">1. Check-in / Diagnóstico</h2>

      {!checkedIn ? (
        <Button type="button" onClick={handleCheckIn} disabled={isPending} className="w-full">
          {isPending ? "Iniciando..." : "Iniciar Atención"}
        </Button>
      ) : (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Check-in registrado. Completa el diagnóstico para continuar.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmitDiagnostico)} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Hallazgos del diagnóstico</label>
          <textarea
            {...register("hallazgos")}
            rows={4}
            disabled={!checkedIn}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            placeholder="Describe lo que encontraste en el equipo..."
          />
          {errors.hallazgos && <p className="mt-1 text-xs text-red-600">{errors.hallazgos.message}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            {...register("causaRaizIdentificada")}
            disabled={!checkedIn}
            className="h-4 w-4 rounded border-gray-300"
          />
          Causa raíz identificada
        </label>

        <Button type="submit" disabled={!checkedIn || isPending} className="w-full">
          Guardar diagnóstico y continuar
        </Button>
      </form>
    </section>
  );
}
