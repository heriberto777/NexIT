"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolverCotizacion } from "@/server/actions/tickets/resolver-cotizacion";
import { Button } from "@/components/ui/button";

export function CotizacionActions({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [comentario, setComentario] = useState("");

  function ejecutar(decision: "APROBADO" | "RECHAZADO") {
    setError(null);
    startTransition(async () => {
      try {
        await resolverCotizacion({ cotizacionId, decision, comentario: comentario || undefined });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  if (mostrarRechazo) {
    return (
      <div className="space-y-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <label className="block text-xs font-medium text-gray-700">Motivo del rechazo (obligatorio)</label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="El costo me parece elevado porque..."
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => setMostrarRechazo(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={isPending || comentario.trim().length === 0}
            onClick={() => ejecutar("RECHAZADO")}
            className="flex-1"
          >
            Confirmar rechazo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={() => ejecutar("APROBADO")} className="flex-1">
          Aprobar
        </Button>
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => setMostrarRechazo(true)} className="flex-1">
          Rechazar
        </Button>
      </div>
    </div>
  );
}
