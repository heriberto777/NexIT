"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarRepuestoSchema } from "@/lib/zod/evidencia.schema";
import type { RegistrarRepuestoInput } from "@/lib/zod/evidencia.schema";

// Paso 4: registra el consumo de un repuesto de inventario en el ticket.
// Si no hay stock suficiente, el repuesto queda PENDIENTE y el ticket pasa a ESPERANDO_REPUESTO
// en vez de bloquear la operación.
export async function registrarRepuesto(input: RegistrarRepuestoInput) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId, repuestoId, cantidad } = registrarRepuestoSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  return prisma.$transaction(async (tx) => {
    const repuesto = await tx.repuesto.findUniqueOrThrow({ where: { id: repuestoId } });

    // Update atómico condicionado al stock real en la BD en el momento del UPDATE, no a
    // la lectura de arriba — dos técnicos consumiendo el mismo repuesto casi al mismo
    // tiempo con 1 unidad en stock pasarían AMBOS un chequeo en memoria hecho sobre la
    // misma lectura obsoleta y dejarían stockActual en negativo. `updateMany` con el
    // stock en el `where` hace que Postgres evalúe la condición al escribir, no antes.
    const resultado = await tx.repuesto.updateMany({
      where: { id: repuestoId, stockActual: { gte: cantidad } },
      data: { stockActual: { decrement: cantidad } },
    });
    const hayStock = resultado.count > 0;

    const ticketRepuesto = await tx.ticketRepuesto.create({
      data: {
        ticketId,
        repuestoId,
        cantidad,
        costoTotal: repuesto.costoUnidad.mul(cantidad),
        estadoAprobacion: hayStock ? "APROBADO" : "PENDIENTE",
        aprobadoPorId: hayStock ? usuario.id : null,
      },
    });

    if (hayStock) {
      // Kardex: el consumo del ticket también es un movimiento de inventario, en la
      // misma transacción que el descuento de stock — nunca uno sin el otro.
      await tx.movimientoInventario.create({
        data: {
          repuestoId,
          tipo: "CONSUMO_TICKET",
          cantidad: -cantidad,
          motivo: `Consumido en ticket ${ticketId}`,
          usuarioId: usuario.id,
          ticketRepuestoId: ticketRepuesto.id,
        },
      });
    } else {
      await tx.ticket.update({ where: { id: ticketId }, data: { estado: "ESPERANDO_REPUESTO" } });
    }

    await tx.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoNuevo: hayStock ? "EN_EJECUCION" : "ESPERANDO_REPUESTO",
        comentario: `Repuesto ${repuesto.nombre} x${cantidad} ${hayStock ? "consumido" : "pendiente de aprobación"}`,
      },
    });

    // Server Actions serializan el valor de retorno hacia el Client Component que las
    // invoca; Prisma.Decimal no es serializable ahí, así que nunca se devuelve el
    // registro crudo — solo los campos planos que el wizard necesita.
    return {
      id: ticketRepuesto.id,
      cantidad: ticketRepuesto.cantidad,
      costoTotal: ticketRepuesto.costoTotal.toNumber(),
      estadoAprobacion: ticketRepuesto.estadoAprobacion,
    };
  });
}
