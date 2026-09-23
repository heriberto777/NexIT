"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cancelarTicketSchema } from "@/lib/zod/ticket.schema";
import type { CancelarTicketInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function cancelarTicket(input: CancelarTicketInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede cancelar tickets`);
  }

  const { ticketId, motivo } = cancelarTicketSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ESTADOS_TERMINALES.has(ticket.estado)) {
    throw new Error(`No se puede cancelar un ticket en estado ${ticket.estado}`);
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const ticketActualizado = await tx.ticket.update({
      where: { id: ticketId },
      data: { estado: "CANCELADO" },
    });

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

  return { id: actualizado.id, estado: actualizado.estado };
}
