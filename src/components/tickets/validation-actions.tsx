"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validarVisita } from "@/server/actions/tickets/validar-visita";
import { cerrarTicket } from "@/server/actions/tickets/cerrar-ticket";

interface Props {
  ticketId: string;
  estado: string;
  rolActual: string | null;
}

export function ValidationActions({ ticketId, estado, rolActual }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [comentario, setComentario] = useState("");

  function ejecutar<T>(accion: () => Promise<T>) {
    setError(null);
    startTransition(async () => {
      try {
        await accion();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  const puedeValidar =
    estado === "ESPERANDO_VALIDACION" && (rolActual === "CLIENTE" || rolActual === "COORDINADOR" || rolActual === "ADMIN");
  const puedeCerrar = estado === "RESUELTO" && (rolActual === "COORDINADOR" || rolActual === "ADMIN");

  if (!puedeValidar && !puedeCerrar) return null;

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Acciones</h2>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {puedeValidar && !mostrarRechazo && (
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={isPending}
            onClick={() => ejecutar(() => validarVisita({ ticketId, decision: "APROBAR" }))}
            className="flex-1"
          >
            Aprobar visita
          </Button>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => setMostrarRechazo(true)} className="flex-1">
            Rechazar / Reabrir
          </Button>
        </div>
      )}

      {puedeValidar && mostrarRechazo && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Motivo del rechazo (obligatorio)</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="El problema persiste porque..."
          />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => setMostrarRechazo(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending || comentario.trim().length === 0}
              onClick={() => ejecutar(() => validarVisita({ ticketId, decision: "RECHAZAR", comentario }))}
              className="flex-1"
            >
              Confirmar rechazo
            </Button>
          </div>
        </div>
      )}

      {puedeCerrar && (
        <Button type="button" disabled={isPending} onClick={() => ejecutar(() => cerrarTicket({ ticketId }))} className="w-full">
          Cerrar ticket
        </Button>
      )}
    </section>
  );
}
