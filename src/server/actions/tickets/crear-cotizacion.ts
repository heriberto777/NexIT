"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearCotizacionSchema } from "@/lib/zod/ticket.schema";
import type { CrearCotizacionInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";

const ROLES_PERMITIDOS = ["TECNICO", "COORDINADOR", "ADMIN"] as const;

export async function crearCotizacion(input: CrearCotizacionInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede solicitar cotizaciones`);
  }

  const { ticketId, monto, descripcion } = crearCotizacionSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ESTADOS_TERMINALES.has(ticket.estado)) {
    throw new Error(`No se puede solicitar una cotización en un ticket ${ticket.estado}`);
  }
  if (usuario.rol === "TECNICO" && ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  const cotizacion = await prisma.$transaction(async (tx) => {
    const nueva = await tx.cotizacion.create({
      data: { ticketId, monto, descripcion },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoNuevo: ticket.estado,
        comentario: `Cotización solicitada por S/ ${monto.toFixed(2)}: ${descripcion}`,
      },
    });

    return nueva;
  });

  return { id: cotizacion.id };
}
