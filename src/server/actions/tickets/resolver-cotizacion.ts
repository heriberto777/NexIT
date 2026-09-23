"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { resolverCotizacionSchema } from "@/lib/zod/ticket.schema";
import type { ResolverCotizacionInput } from "@/lib/zod/ticket.schema";

const ROLES_PERMITIDOS = ["CLIENTE", "COORDINADOR", "ADMIN"] as const;

// Mismo patrón que validar-visita.ts: el Cliente resuelve lo suyo; Coordinador/Admin
// pueden hacerlo como override (ej. el cliente no respondió a tiempo por teléfono).
export async function resolverCotizacion(input: ResolverCotizacionInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede resolver cotizaciones`);
  }

  const { cotizacionId, decision, comentario } = resolverCotizacionSchema.parse(input);

  const cotizacion = await prisma.cotizacion.findUniqueOrThrow({
    where: { id: cotizacionId },
    include: { ticket: true },
  });

  if (usuario.rol === "CLIENTE" && usuario.clienteId !== cotizacion.ticket.clienteId) {
    throw new Error("No tienes acceso a esta cotización");
  }
  if (cotizacion.estado !== "PENDIENTE") {
    throw new Error(`Esta cotización ya fue ${cotizacion.estado.toLowerCase()}`);
  }

  const actualizada = await prisma.$transaction(async (tx) => {
    const cotizacionActualizada = await tx.cotizacion.update({
      where: { id: cotizacionId },
      data: { estado: decision, aprobadoPorId: usuario.id },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: cotizacion.ticketId,
        usuarioId: usuario.id,
        estadoNuevo: cotizacion.ticket.estado,
        comentario:
          decision === "APROBADO"
            ? `Cotización de S/ ${cotizacion.monto.toFixed(2)} aprobada`
            : `Cotización de S/ ${cotizacion.monto.toFixed(2)} rechazada: ${comentario}`,
      },
    });

    return cotizacionActualizada;
  });

  return { id: actualizada.id, estado: actualizada.estado };
}
