"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarRepuestoSchema } from "@/lib/zod/evidencia.schema";
import type { RegistrarRepuestoInput } from "@/lib/zod/evidencia.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { tieneAccesoAlTicket, INCLUDE_COLABORADORES } from "@/server/services/ticket-acceso.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { formatCurrency } from "@/lib/utils/currency";

export type ResultadoRegistrarRepuesto =
  | { tipo: "CONSUMIDO"; id: string; cantidad: number; costoTotal: number }
  | { tipo: "COTIZADO"; cotizacionId: string; cantidad: number; monto: number };

// Paso 4: registra el consumo de un repuesto de inventario en el ticket. Si hay stock
// suficiente se descuenta y queda consumido de una vez (como siempre). Si NO hay
// stock, en vez de dejar un TicketRepuesto PENDIENTE huérfano (que nunca se resolvía
// solo, ni revertía el ticket de ESPERANDO_REPUESTO) se genera una Cotizacion tipo
// PRODUCTO sobre este mismo ticket — así Admin/Coordinador la gestionan con el mismo
// mecanismo que ya existe (aprobación del cliente, /admin/facturacion, ticket de
// instalación o "marcar como enviado"). El ticket NO se bloquea: su estado no se
// toca, el técnico sigue el wizard con normalidad.
export async function registrarRepuesto(input: RegistrarRepuestoInput): Promise<ActionResult<ResultadoRegistrarRepuesto>> {
  return ejecutarAccion(async () => {
    // Sin restricción de rol acá: un Admin/Coordinador puede estar asignado como
    // "técnico" de este ticket (ver asignar-tecnico.ts) y ejecutar el wizard él mismo —
    // la propiedad (el chequeo de abajo), no el rol, es lo que habilita cada paso.
    const usuario = await requireUsuario();
    const { ticketId, repuestoId, cantidad } = registrarRepuestoSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: INCLUDE_COLABORADORES });
    if (!tieneAccesoAlTicket(ticket, usuario.id)) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    const { monedaSimbolo } = await obtenerConfiguracion();

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

      if (hayStock) {
        const ticketRepuesto = await tx.ticketRepuesto.create({
          data: {
            ticketId,
            repuestoId,
            cantidad,
            costoTotal: repuesto.costoUnidad.mul(cantidad),
            estadoAprobacion: "APROBADO",
            aprobadoPorId: usuario.id,
          },
        });

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

        await tx.ticketHistorial.create({
          data: {
            ticketId,
            usuarioId: usuario.id,
            estadoNuevo: ticket.estado,
            comentario: `Repuesto ${repuesto.nombre} x${cantidad} consumido`,
          },
        });

        return {
          tipo: "CONSUMIDO" as const,
          id: ticketRepuesto.id,
          cantidad: ticketRepuesto.cantidad,
          costoTotal: ticketRepuesto.costoTotal.toNumber(),
        };
      }

      // Mismo cálculo que crear-cotizacion.ts: el precio sale del catálogo
      // (precioVenta si está definido, si no costoUnidad), nunca se inventa acá.
      const precioBase = repuesto.precioVenta ?? repuesto.costoUnidad;
      const monto = precioBase.mul(cantidad).toNumber();
      const descripcion = `${repuesto.nombre} x${cantidad} — sin stock disponible`;

      const cotizacion = await tx.cotizacion.create({
        data: { ticketId, monto, descripcion, repuestoId, cantidad },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoNuevo: ticket.estado,
          comentario: `Repuesto ${repuesto.nombre} x${cantidad} sin stock — se generó una cotización de ${formatCurrency(monto, monedaSimbolo)} para reponerlo`,
        },
      });

      return { tipo: "COTIZADO" as const, cotizacionId: cotizacion.id, cantidad, monto };
    });
  });
}
