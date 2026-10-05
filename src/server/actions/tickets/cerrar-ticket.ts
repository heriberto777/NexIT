"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cerrarTicketSchema } from "@/lib/zod/ticket.schema";
import type { CerrarTicketInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

// Cierre administrativo: solo Coordinador/Admin, y solo sobre un ticket ya RESUELTO
// (validado por el cliente). Separado de validarVisita porque son actores y momentos
// distintos del flujo — el cliente resuelve su parte, el coordinador archiva el ticket.
export async function cerrarTicket(
  input: CerrarTicketInput,
): Promise<ActionResult<{ id: string; estado: string }>> {
  return ejecutarAccion(async () => {
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
      // Re-verifica RESUELTO al momento de escribir, no el leído arriba — un doble clic
      // (o una reapertura concurrente) no debería poder cerrar dos veces ni cerrar un
      // ticket que mientras tanto se reabrió.
      const { count } = await tx.ticket.updateMany({ where: { id: ticketId, estado: "RESUELTO" }, data: { estado: "CERRADO" } });
      if (count === 0) {
        throw new Error("El ticket cambió de estado mientras tanto — recargá la página e intentá de nuevo");
      }
      const actualizado = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });

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
  });
}
