"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cerrarTicketSchema } from "@/lib/zod/ticket.schema";
import type { CerrarTicketInput } from "@/lib/zod/ticket.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

// Cierre administrativo: solo Coordinador/Admin, y solo sobre un ticket ya RESUELTO
// (validado por el cliente). Separado de validarVisita porque son actores y momentos
// distintos del flujo — el cliente resuelve su parte, el coordinador archiva el ticket.
export async function cerrarTicket(input: CerrarTicketInput) {
  const usuario = await requireUsuario();
  const { ticketId } = cerrarTicketSchema.parse(input);

  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede cerrar tickets`);
  }

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.estado !== "RESUELTO") {
    throw new Error(`Solo se puede cerrar un ticket en estado RESUELTO (actual: ${ticket.estado})`);
  }

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.ticket.update({ where: { id: ticketId }, data: { estado: "CERRADO" } });

    await tx.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoAnterior: "RESUELTO",
        estadoNuevo: "CERRADO",
        comentario: "Cierre administrativo",
      },
    });

    return { id: actualizado.id, estado: actualizado.estado };
  });
}
