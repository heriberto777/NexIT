"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { cambiarEstadoContratoSchema } from "@/lib/zod/admin.schema";
import type { CambiarEstadoContratoInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function cambiarEstadoContrato(input: CambiarEstadoContratoInput): Promise<ActionResult<{ id: string; estado: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede cambiar el estado de contratos`);
    }

    const { id, estado } = cambiarEstadoContratoSchema.parse(input);

    const actualizado = await prisma.contrato.update({ where: { id }, data: { estado } });

    await registrarAuditoria({
      usuario,
      accion: "contrato.cambiar_estado",
      entidad: "Contrato",
      entidadId: actualizado.id,
      detalle: `Cambió el estado a ${estado}`,
    });

    return { id: actualizado.id, estado: actualizado.estado };
  });
}
