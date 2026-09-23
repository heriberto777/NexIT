"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { emitirEvento } from "@/server/services/webhook.service";

const iniciarAtencionSchema = z.object({
  ticketId: z.string().cuid(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
});

// Paso 1: check-in del técnico en el sitio. Pasa el ticket a EN_DIAGNOSTICO.
export async function iniciarAtencion(input: z.infer<typeof iniciarAtencionSchema>) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId } = iniciarAtencionSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { cliente: true, creadoPor: true },
  });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const ticketActualizado = await tx.ticket.update({
      where: { id: ticketId },
      data: { estado: "EN_DIAGNOSTICO", fechaInicioAtencion: new Date() },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoAnterior: ticket.estado,
        estadoNuevo: "EN_DIAGNOSTICO",
        comentario: "Check-in del técnico en sitio",
      },
    });

    return ticketActualizado;
  });

  // Fuera de la transacción a propósito: si el webhook fallara, no debe revertir el
  // cambio de estado ya confirmado en la base de datos.
  emitirEvento({
    tipo: "TICKET_CAMBIO_ESTADO",
    ticketId,
    numeroTicket: actualizado.numeroTicket,
    clienteNombre: ticket.cliente.nombre,
    estadoAnterior: ticket.estado,
    estadoNuevo: "EN_DIAGNOSTICO",
    reportadoPorNombre: ticket.creadoPor.nombre,
    reportadoPorEmail: ticket.creadoPor.email,
  });

  return actualizado;
}
