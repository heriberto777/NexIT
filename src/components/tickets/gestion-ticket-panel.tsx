"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editarTicketSchema, type EditarTicketInput } from "@/lib/zod/ticket.schema";
import { asignarTecnico } from "@/server/actions/tickets/asignar-tecnico";
import { editarTicket } from "@/server/actions/tickets/editar-ticket";
import { cancelarTicket } from "@/server/actions/tickets/cancelar-ticket";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface TecnicoOpcion {
  id: string;
  nombre: string;
}

interface Props {
  ticket: {
    id: string;
    titulo: string;
    descripcion: string;
    prioridad: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
    tecnicoAsignadoId: string | null;
  };
  tecnicos: TecnicoOpcion[];
}

// El caller (page.tsx) ya no renderiza este panel para tickets en RESUELTO/CERRADO/
// CANCELADO — no se repite esa condición aquí.
export function GestionTicketPanel({ ticket, tecnicos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tecnicoId, setTecnicoId] = useState(ticket.tecnicoAsignadoId ?? "");
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarTicketInput>({
    resolver: zodResolver(editarTicketSchema),
    defaultValues: { ticketId: ticket.id, titulo: ticket.titulo, descripcion: ticket.descripcion, prioridad: ticket.prioridad },
  });

  function guardarAsignacion() {
    setError(null);
    if (!tecnicoId) return;
    startTransition(async () => {
      try {
        await asignarTecnico({ ticketId: ticket.id, tecnicoId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  async function guardarEdicion(values: EditarTicketInput) {
    setError(null);
    try {
      await editarTicket(values);
      setEditando(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  function confirmarCancelacion() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelarTicket({ ticketId: ticket.id, motivo: motivoCancelacion });
        setCancelando(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Gestionar ticket</h2>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {ticket.tecnicoAsignadoId ? "Reasignar técnico" : "Asignar técnico"}
          </label>
          <select
            value={tecnicoId}
            onChange={(e) => setTecnicoId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona un técnico</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={guardarAsignacion} disabled={isPending || !tecnicoId || tecnicoId === ticket.tecnicoAsignadoId}>
          {isPending ? "Guardando..." : "Asignar"}
        </Button>
      </div>

      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <Button type="button" variant="secondary" onClick={() => setEditando(true)} className="flex-1">
          Editar ticket
        </Button>
        <Button type="button" variant="danger" onClick={() => setCancelando(true)} className="flex-1">
          Cancelar ticket
        </Button>
      </div>

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar ticket">
        <form onSubmit={handleSubmit(guardarEdicion)} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
            <input {...register("titulo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {errors.titulo && <p className="mt-1 text-xs text-red-600">{errors.titulo.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
            <textarea {...register("descripcion")} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {errors.descripcion && <p className="mt-1 text-xs text-red-600">{errors.descripcion.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Prioridad</label>
            <select {...register("prioridad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </Modal>

      <Modal open={cancelando} onClose={() => setCancelando(false)} title="Cancelar ticket">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Esta acción no se puede deshacer. Indica el motivo de la cancelación.</p>
          <textarea
            value={motivoCancelacion}
            onChange={(e) => setMotivoCancelacion(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="El cliente desistió de la solicitud porque..."
          />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelando(false)} className="flex-1">
              Volver
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending || motivoCancelacion.trim().length < 5}
              onClick={confirmarCancelacion}
              className="flex-1"
            >
              {isPending ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
