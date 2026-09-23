"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { emitirEvento } from "@/server/services/webhook.service";
import { finalizarVisitaSchema } from "@/lib/zod/evidencia.schema";
import type { FinalizarVisitaInput } from "@/lib/zod/evidencia.schema";

// Paso 6: cierre del wizard. Valida que existan firma y evidencias mínimas antes de
// transicionar el ticket (a ESPERANDO_VALIDACION o RESUELTO, según config del contrato).
export async function finalizarVisita(input: FinalizarVisitaInput) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId, notasInternas } = finalizarVisitaSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { firmas: true, evidencias: true, cliente: true, creadoPor: true },
  });

  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }
  if (ticket.firmas.length === 0) {
    throw new Error("No se puede cerrar la visita sin firma de conformidad");
  }
  if (ticket.evidencias.filter((e) => e.tipo === "FOTO_ANTES").length === 0) {
    throw new Error("Falta al menos una foto de 'antes'");
  }
  if (ticket.evidencias.filter((e) => e.tipo === "FOTO_DESPUES").length === 0) {
    throw new Error("Falta al menos una foto de 'después'");
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
  });

  return actualizado;
}
