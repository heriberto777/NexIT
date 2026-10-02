"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarCambioEstadoCliente } from "@/server/services/notificacion.service";
import { finalizarVisitaSchema } from "@/lib/zod/evidencia.schema";
import type { FinalizarVisitaInput } from "@/lib/zod/evidencia.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { tieneAccesoAlTicket, INCLUDE_COLABORADORES } from "@/server/services/ticket-acceso.service";

// Paso 6: cierre del wizard. Valida que existan firma y evidencias mínimas antes de
// transicionar el ticket (a ESPERANDO_VALIDACION o RESUELTO, según config del contrato).
export async function finalizarVisita(
  input: FinalizarVisitaInput,
): Promise<ActionResult<Awaited<ReturnType<typeof prisma.ticket.update>>>> {
  return ejecutarAccion(async () => {
    // Sin restricción de rol acá: un Admin/Coordinador puede estar asignado como
    // "técnico" de este ticket (ver asignar-tecnico.ts) y ejecutar el wizard él mismo —
    // la propiedad (el chequeo de abajo), no el rol, es lo que habilita cada paso.
    const usuario = await requireUsuario();
    const { ticketId, notasInternas } = finalizarVisitaSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { firmas: true, evidencias: true, cliente: true, creadoPor: true, ...INCLUDE_COLABORADORES },
    });

    if (!tieneAccesoAlTicket(ticket, usuario.id)) {
      throw new Error("Este ticket no está asignado a este técnico");
    }
    if (ticket.firmas.length === 0) {
      throw new Error("No se puede cerrar la visita sin firma de conformidad");
    }
    if (!ticket.evidenciaNoAplica) {
      if (ticket.evidencias.filter((e) => e.tipo === "FOTO_ANTES").length === 0) {
        throw new Error("Falta al menos una foto de 'antes'");
      }
      if (ticket.evidencias.filter((e) => e.tipo === "FOTO_DESPUES").length === 0) {
        throw new Error("Falta al menos una foto de 'después'");
      }
    }

    const estadoNuevo = "ESPERANDO_VALIDACION" as const;

    const actualizado = await prisma.$transaction(async (tx) => {
      const ticketActualizado = await tx.ticket.update({
        where: { id: ticketId },
        data: { estado: estadoNuevo, fechaResolucion: new Date() },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoAnterior: ticket.estado,
          estadoNuevo,
          comentario: notasInternas ? `Visita finalizada. Notas: ${notasInternas}` : "Visita finalizada",
        },
      });

      return ticketActualizado;
    });

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

    if (ticket.creadoPor.rol === "CLIENTE") {
      await notificarCambioEstadoCliente(
        ticket.creadoPor.id,
        actualizado,
        "Visita lista para revisar",
        "El técnico finalizó la visita — ingresa a revisar el informe y aprobar o rechazar.",
      );
    }

    return actualizado;
  });
}
