"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { marcarFacturacionSchema } from "@/lib/zod/admin.schema";
import type { MarcarFacturacionInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function marcarFacturacionRepuesto(input: MarcarFacturacionInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede marcar facturación`);
    }

    const { id, estadoFacturacion } = marcarFacturacionSchema.parse(input);

    const ticketRepuesto = await prisma.ticketRepuesto.findUniqueOrThrow({ where: { id } });
    if (ticketRepuesto.estadoAprobacion !== "APROBADO") {
      throw new Error("Solo se puede facturar un repuesto ya consumido (aprobado)");
    }

    const actualizado = await prisma.ticketRepuesto.update({ where: { id }, data: { estadoFacturacion } });

    await registrarAuditoria({
      usuario,
      accion: "ticket_repuesto.marcar_facturacion",
      entidad: "TicketRepuesto",
      entidadId: actualizado.id,
      detalle: `Marcado como ${estadoFacturacion}`,
    });

    return { id: actualizado.id };
  });
}
