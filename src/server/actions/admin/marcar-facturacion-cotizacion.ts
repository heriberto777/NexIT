"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { marcarFacturacionSchema } from "@/lib/zod/admin.schema";
import type { MarcarFacturacionInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function marcarFacturacionCotizacion(input: MarcarFacturacionInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede marcar facturación`);
    }

    const { id, estadoFacturacion } = marcarFacturacionSchema.parse(input);

    const cotizacion = await prisma.cotizacion.findUniqueOrThrow({ where: { id } });
    if (cotizacion.estado !== "APROBADO") {
      throw new Error("Solo se puede facturar una cotización ya aprobada por el cliente");
    }

    const actualizada = await prisma.cotizacion.update({ where: { id }, data: { estadoFacturacion } });

    await registrarAuditoria({
      usuario,
      accion: "cotizacion.marcar_facturacion",
      entidad: "Cotizacion",
      entidadId: actualizada.id,
      detalle: `Marcada como ${estadoFacturacion}`,
    });

    return { id: actualizada.id };
  });
}
