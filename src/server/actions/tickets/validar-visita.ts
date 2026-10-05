"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarTicketSinAsignar } from "@/server/services/notificacion.service";
import { validarVisitaSchema } from "@/lib/zod/ticket.schema";
import type { ValidarVisitaInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["CLIENTE", "COORDINADOR", "ADMIN"] as const;

// El Cliente valida la visita que el técnico marcó como terminada. Aprobar cierra el
// ciclo de trabajo (ESPERANDO_VALIDACION -> RESUELTO); rechazar reabre el ticket
// (-> REABIERTO) para que el coordinador reasigne. Coordinador/Admin pueden hacerlo
// también como override (ej. el cliente no respondió a tiempo).
export async function validarVisita(
  input: ValidarVisitaInput,
): Promise<ActionResult<{ id: string; estado: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { ticketId, decision, comentario } = validarVisitaSchema.parse(input);

    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede validar visitas`);
    }

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { cliente: true, creadoPor: true },
    });

    if (usuario.rol === "CLIENTE" && usuario.clienteId !== ticket.clienteId) {
      throw new Error("No tienes acceso a este ticket");
    }
    if (ticket.estado !== "ESPERANDO_VALIDACION") {
      throw new Error(`El ticket no está esperando validación (estado actual: ${ticket.estado})`);
    }

    const estadoNuevo = decision === "APROBAR" ? "RESUELTO" : "REABIERTO";

    const actualizado = await prisma.$transaction(async (tx) => {
      const ticketActualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          estado: estadoNuevo,
          fechaResolucion: decision === "APROBAR" ? new Date() : null,
          // Al reabrir: fechaReapertura reinicia el reloj del SLA (ver sla.ts) y
          // fechaInicioAtencion vuelve a null para que calcularPasoInicial en
          // execution-wizard.tsx mande al técnico de nuevo al paso 1 — sin esto, el
          // wizard saltaba directo a un paso avanzado (incluso "firma") usando datos
          // de la visita ya rechazada.
          ...(estadoNuevo === "REABIERTO" ? { fechaReapertura: new Date(), fechaInicioAtencion: null } : {}),
        },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoAnterior: ticket.estado,
          estadoNuevo,
          comentario: comentario ?? (decision === "APROBAR" ? "Visita aprobada por el cliente" : undefined),
        },
      });

      return ticketActualizado;
    });

    // Solo RESUELTO dispara el evento de negocio pedido; REABIERTO es un flujo interno
    // de reasignación, no uno de los tres eventos de integración solicitados.
    if (estadoNuevo === "RESUELTO") {
      emitirEvento({
        tipo: "TICKET_CAMBIO_ESTADO",
        ticketId,
        numeroTicket: actualizado.numeroTicket,
        clienteNombre: ticket.cliente.nombre,
        estadoAnterior: ticket.estado,
        estadoNuevo,
        reportadoPorNombre: ticket.creadoPor.nombre,
        reportadoPorEmail: ticket.creadoPor.email,
        reportadoPorTelegramChatId: ticket.creadoPor.telegramChatId,
        reportadoPorWhatsapp: ticket.creadoPor.whatsappTelefono,
      });
    } else {
      // REABIERTO: el cliente rechazó el trabajo — necesita reasignación aunque
      // tecnicoAsignadoId no se haya limpiado, así que entra al mismo tipo de
      // notificación que un ticket recién creado sin técnico.
      await notificarTicketSinAsignar(actualizado, comentario ?? "El cliente rechazó la visita — necesita reasignación.");
    }

    return { id: actualizado.id, estado: actualizado.estado };
  });
}
