"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { editarTicketSchema } from "@/lib/zod/ticket.schema";
import type { EditarTicketInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarTicket(input: EditarTicketInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar tickets`);
  }

  const { ticketId, titulo, descripcion, prioridad } = editarTicketSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ESTADOS_TERMINALES.has(ticket.estado)) {
    throw new Error(`No se puede editar un ticket en estado ${ticket.estado}`);
  }

  const cambios: string[] = [];
  if (ticket.titulo !== titulo) cambios.push("título");
  if (ticket.descripcion !== descripcion) cambios.push("descripción");
  if (ticket.prioridad !== prioridad) cambios.push(`prioridad (${ticket.prioridad} → ${prioridad})`);

  const actualizado = await prisma.$transaction(async (tx) => {
    const ticketActualizado = await tx.ticket.update({
      where: { id: ticketId },
      data: { titulo, descripcion, prioridad },
    });

    if (cambios.length > 0) {
      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoNuevo: ticket.estado,
          comentario: `Editado: ${cambios.join(", ")}`,
        },
      });
    }

    return ticketActualizado;
  });

  return { id: actualizado.id };
}
