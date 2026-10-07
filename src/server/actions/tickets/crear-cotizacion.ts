"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearCotizacionSchema } from "@/lib/zod/ticket.schema";
import type { CrearCotizacionInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["TECNICO", "COORDINADOR", "ADMIN"] as const;

export async function crearCotizacion(input: CrearCotizacionInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede solicitar cotizaciones`);
    }

    const datos = crearCotizacionSchema.parse(input);
    const { ticketId } = datos;

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ESTADOS_TERMINALES.has(ticket.estado)) {
      throw new Error(`No se puede solicitar una cotización en un ticket ${ticket.estado}`);
    }
    if (usuario.rol === "TECNICO" && ticket.tecnicoAsignadoId !== usuario.id) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    const { monedaSimbolo } = await obtenerConfiguracion();

    // El monto de tipo PRODUCTO se recalcula acá contra el precio real del catálogo EN
    // ESTE MOMENTO — nunca se usa un monto que venga del cliente, así nadie puede mandar
    // uno manipulado a mano aunque conozca el repuestoId (ver crearCotizacionSchema).
    let monto: number;
    let descripcion: string;
    let repuestoId: string | null = null;
    let cantidad: number | null = null;

    if (datos.tipo === "PRODUCTO") {
      const repuesto = await prisma.repuesto.findUniqueOrThrow({ where: { id: datos.repuestoId } });
      repuestoId = repuesto.id;
      cantidad = datos.cantidad;
      const precioBase = repuesto.precioVenta ?? repuesto.costoUnidad;
      monto = precioBase.mul(datos.cantidad).toNumber();
      descripcion = `${repuesto.nombre} x${datos.cantidad}${repuesto.descripcion ? ` — ${repuesto.descripcion}` : ""}`;
    } else {
      monto = datos.monto;
      descripcion = datos.descripcion;
    }

    const cotizacion = await prisma.$transaction(async (tx) => {
      const nueva = await tx.cotizacion.create({
        data: { ticketId, monto, descripcion, repuestoId, cantidad },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoNuevo: ticket.estado,
          comentario: `Cotización solicitada por ${formatCurrency(monto, monedaSimbolo)}: ${descripcion}`,
        },
      });

      return nueva;
    });

    return { id: cotizacion.id };
  });
}
