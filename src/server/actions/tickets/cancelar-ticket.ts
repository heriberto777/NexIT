"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cancelarTicketSchema } from "@/lib/zod/ticket.schema";
import type { CancelarTicketInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { emitirEvento } from "@/server/services/webhook.service";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { notificarCambioEstadoCliente } from "@/server/services/notificacion.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function cancelarTicket(
  input: CancelarTicketInput,
): Promise<ActionResult<{ id: string; estado: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede cancelar tickets`);
    }

    const { ticketId, motivo } = cancelarTicketSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: { cliente: true, creadoPor: true } });
    if (ESTADOS_TERMINALES.has(ticket.estado)) {
      throw new Error(`No se puede cancelar un ticket en estado ${ticket.estado}`);
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      // El `where` re-verifica que el ticket siga sin estado terminal al momento de
      // escribir, no el leído arriba — evita cancelar "encima" de una transición
      // concurrente (ej. asignación) que ya lo movió a un estado terminal distinto.
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, estado: { notIn: Array.from(ESTADOS_TERMINALES) } },
        data: { estado: "CANCELADO" },
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
          estadoNuevo: "CANCELADO",
          comentario: motivo,
        },
      });

      return ticketActualizado;
    });

    // A diferencia de las demás transiciones (creado/asignado/en diagnóstico/esperando
    // validación), cancelar no emitía ningún evento — el cliente que reportó el ticket
    // nunca se enteraba de que se había cancelado, ni siquiera por email.
    emitirEvento({
      tipo: "TICKET_CAMBIO_ESTADO",
      ticketId,
      numeroTicket: actualizado.numeroTicket,
      clienteNombre: ticket.cliente.nombre,
      estadoAnterior: ticket.estado,
      estadoNuevo: "CANCELADO",
      reportadoPorNombre: ticket.creadoPor.nombre,
      reportadoPorEmail: ticket.creadoPor.email,
      reportadoPorTelegramChatId: ticket.creadoPor.telegramChatId,
      reportadoPorWhatsapp: ticket.creadoPor.whatsappTelefono,
      motivo,
    });

    await registrarAuditoria({
      usuario,
      accion: "ticket.cancelar",
      entidad: "Ticket",
      entidadId: ticketId,
      detalle: `Canceló el ticket ${actualizado.numeroTicket} (estaba en ${ticket.estado}). Motivo: ${motivo}`,
    });

    if (ticket.creadoPor.rol === "CLIENTE") {
      await notificarCambioEstadoCliente(ticket.creadoPor.id, actualizado, "Ticket cancelado", motivo);
    }

    return { id: actualizado.id, estado: actualizado.estado };
  });
}
