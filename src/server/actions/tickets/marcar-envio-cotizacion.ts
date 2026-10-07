"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { marcarEnvioCotizacionSchema } from "@/lib/zod/ticket.schema";
import type { MarcarEnvioCotizacionInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

// Alternativa a crear-ticket-instalacion.ts: para un producto que no necesita que un
// técnico lo instale (ej. un mouse, una licencia física), se deja constancia de que
// se envió por un medio externo en vez de generar un ticket de seguimiento. Llamar de
// nuevo esta acción permite corregir el dato si hubo un error — no es de una sola vía.
export async function marcarEnvioCotizacion(input: MarcarEnvioCotizacionInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede marcar el envío de una cotización`);
    }

    const { cotizacionId, medioEnvio, detalleEnvio } = marcarEnvioCotizacionSchema.parse(input);

    const cotizacion = await prisma.cotizacion.findUniqueOrThrow({ where: { id: cotizacionId } });
    if (!cotizacion.repuestoId) {
      throw new Error("Esta cotización no es de un producto del catálogo");
    }
    if (cotizacion.estado !== "APROBADO") {
      throw new Error("La cotización todavía no está aprobada por el cliente");
    }
    if (cotizacion.ticketInstalacionId) {
      throw new Error("Ya se generó un ticket de instalación para esta cotización — no se puede marcar como enviada");
    }

    const actualizada = await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: { medioEnvio, detalleEnvio, enviadoEn: new Date() },
    });

    await registrarAuditoria({
      usuario,
      accion: "cotizacion.marcar_envio",
      entidad: "Cotizacion",
      entidadId: actualizada.id,
      detalle: `Marcada como enviada por ${medioEnvio}: ${detalleEnvio}`,
    });

    return { id: actualizada.id };
  });
}
