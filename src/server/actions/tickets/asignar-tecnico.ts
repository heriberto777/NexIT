"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { asignarTicketSchema } from "@/lib/zod/ticket.schema";
import type { AsignarTicketInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarTecnicoAsignado, notificarCambioEstadoCliente } from "@/server/services/notificacion.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;
// Un Admin/Coordinador puede asignarse (o asignarle a otro Admin/Coordinador) un ticket
// cuando necesita atenderlo él mismo — no solo a un Técnico.
const ROLES_ASIGNABLES = ["TECNICO", "COORDINADOR", "ADMIN"] as const;

// Cubre tanto la primera asignación (ABIERTO -> ASIGNADO) como una reasignación a otro
// técnico en cualquier estado posterior — en ese segundo caso el estado del ticket no
// cambia, solo el técnico responsable.
export async function asignarTecnico(
  input: AsignarTicketInput,
): Promise<ActionResult<{ id: string; estado: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede asignar técnicos`);
    }

    const { ticketId, tecnicoId } = asignarTicketSchema.parse(input);

    const [ticket, tecnico] = await Promise.all([
      prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { cliente: true, creadoPor: true } }),
      prisma.usuario.findUniqueOrThrow({ where: { id: tecnicoId } }),
    ]);

    if (ESTADOS_TERMINALES.has(ticket.estado)) {
      throw new Error(`No se puede reasignar un ticket en estado ${ticket.estado}`);
    }
    if (!ROLES_ASIGNABLES.includes(tecnico.rol as (typeof ROLES_ASIGNABLES)[number])) {
      throw new Error("El usuario seleccionado no puede recibir tickets asignados");
    }

    const esPrimeraAsignacion = ticket.estado === "ABIERTO";

    const actualizado = await prisma.$transaction(async (tx) => {
      // El `where` re-verifica el estado al momento de escribir, no el leído arriba —
      // sin esto, una cancelación concurrente (que sí corre entre la lectura y esta
      // escritura) quedaría pisada: el ticket "resucitaría" como ASIGNADO. En
      // reasignación (no es la primera vez) tampoco se toca `estado`, para no pisar con
      // un valor stale un avance real del ticket ocurrido en ese mismo lapso.
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, estado: esPrimeraAsignacion ? "ABIERTO" : { notIn: Array.from(ESTADOS_TERMINALES) } },
        data: {
          tecnicoAsignadoId: tecnicoId,
          ...(esPrimeraAsignacion ? { estado: "ASIGNADO" as const } : {}),
          fechaAsignacion: ticket.fechaAsignacion ?? new Date(),
        },
      });
      if (count === 0) {
        throw new Error("El ticket cambió de estado mientras tanto — recargá la página e intentá de nuevo");
      }

      const ticketActualizado = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoAnterior: ticket.estado,
          estadoNuevo: ticketActualizado.estado,
          comentario: ticket.tecnicoAsignadoId
            ? `Reasignado a ${tecnico.nombre}`
            : `Asignado a ${tecnico.nombre}`,
        },
      });

      return ticketActualizado;
    });

    emitirEvento({
      tipo: "TICKET_ASIGNADO",
      ticketId: actualizado.id,
      numeroTicket: actualizado.numeroTicket,
      clienteNombre: ticket.cliente.nombre,
      titulo: ticket.titulo,
      prioridad: ticket.prioridad,
      esReasignacion: Boolean(ticket.tecnicoAsignadoId),
      origen: ticket.origen,
      tecnicoNombre: tecnico.nombre,
      tecnicoEmail: tecnico.email,
      tecnicoTelegramChatId: tecnico.telegramChatId,
      tecnicoWhatsapp: tecnico.whatsappTelefono,
      reportadoPorNombre: ticket.creadoPor.nombre,
      reportadoPorEmail: ticket.creadoPor.email,
      reportadoPorTelegramChatId: ticket.creadoPor.telegramChatId,
      reportadoPorWhatsapp: ticket.creadoPor.whatsappTelefono,
    });

    await notificarTecnicoAsignado(actualizado, tecnicoId, Boolean(ticket.tecnicoAsignadoId));
    if (ticket.creadoPor.rol === "CLIENTE") {
      await notificarCambioEstadoCliente(
        ticket.creadoPor.id,
        actualizado,
        "Técnico asignado",
        `${tecnico.nombre} fue asignado a tu ticket y ya está trabajando en tu solicitud.`,
      );
    }

    return { id: actualizado.id, estado: actualizado.estado };
  });
}
