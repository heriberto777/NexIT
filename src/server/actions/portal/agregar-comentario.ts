"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { agregarComentarioSchema } from "@/lib/zod/portal.schema";
import type { AgregarComentarioInput } from "@/lib/zod/portal.schema";

// Los comentarios viven en TicketHistorial (mismo timeline que los cambios de estado
// del sistema): estadoNuevo = el estado actual del ticket sin cambiarlo, así una nota
// del cliente aparece intercalada cronológicamente con la auditoría real, en vez de en
// una tabla de "chat" separada que habría que fusionar visualmente de todos modos.
export async function agregarComentarioTicket(input: AgregarComentarioInput) {
  const usuario = await requireUsuario();
  const { ticketId, mensaje } = agregarComentarioSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });

  if (usuario.rol === "CLIENTE" && usuario.clienteId !== ticket.clienteId) {
    throw new Error("No tienes acceso a este ticket");
  }

  await prisma.ticketHistorial.create({
    data: {
      ticketId,
      usuarioId: usuario.id,
      estadoNuevo: ticket.estado,
      comentario: mensaje,
    },
  });

  return { ok: true };
}
