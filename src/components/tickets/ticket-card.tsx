import Link from "next/link";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { SlaBadge } from "@/components/tickets/sla-badge";
import { ESTADOS_CON_WIZARD_ACTIVO } from "@/lib/utils/ticket-estado";
import type { EstadoSla } from "@/lib/utils/sla";

export interface TicketCardData {
  id: string;
  numeroTicket: string;
  titulo: string;
  estado: string;
  prioridad: string;
  estadoSla: EstadoSla | null;
  cliente: { nombre: string };
  sucursal: { nombre: string };
  tecnicoAsignado: { nombre: string } | null;
  fechaCreacion: Date;
}

// Vista de tarjeta para /tickets en mobile: la tabla (7-8 columnas) obligaba a scroll
// horizontal en pantallas angostas y perdía contexto si se ocultaban columnas — cada
// ticket como bloque autocontenido evita ambos problemas. Mismo dato que la tabla,
// solo presentación distinta (sm:hidden en la tabla, esto visible solo debajo de sm:).
export function TicketCard({ ticket, fecha, esTecnico }: { ticket: TicketCardData; fecha: string; esTecnico: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/tickets/${ticket.id}`} className="font-medium text-blue-600 hover:underline">
            #{ticket.numeroTicket}
          </Link>
          <p className="text-sm text-gray-700">{ticket.titulo}</p>
        </div>
        <span className="shrink-0 text-xs text-gray-400">{fecha}</span>
      </div>

      <p className="mt-1 text-xs text-gray-500">
        {ticket.cliente.nombre} · {ticket.sucursal.nombre}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PrioridadBadge prioridad={ticket.prioridad} />
        <EstadoBadge estado={ticket.estado} />
        <SlaBadge estadoSla={ticket.estadoSla} />
      </div>

      <p className="mt-2 text-xs text-gray-500">Técnico: {ticket.tecnicoAsignado?.nombre ?? "Sin asignar"}</p>

      {esTecnico && (
        <div className="mt-3">
          {ESTADOS_CON_WIZARD_ACTIVO.has(ticket.estado) ? (
            <Link
              href={`/tickets/${ticket.id}/ejecucion`}
              className="block whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-blue-700"
            >
              Continuar atención
            </Link>
          ) : (
            <Link href={`/tickets/${ticket.id}`} className="text-xs text-gray-500 underline">
              Ver detalle
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
