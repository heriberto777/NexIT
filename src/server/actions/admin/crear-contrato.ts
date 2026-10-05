"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { crearContratoSchema } from "@/lib/zod/admin.schema";
import type { CrearContratoInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearContrato(input: CrearContratoInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede registrar contratos`);
    }

    const { clienteId, tipoContrato, fechaInicio, fechaFin, horasIncluidas, slas } = crearContratoSchema.parse(input);

    const contrato = await prisma.contrato.create({
      data: {
        clienteId,
        tipoContrato,
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        horasIncluidas: horasIncluidas ?? null,
        slas: { create: slas },
      },
    });

    await registrarAuditoria({
      usuario,
      accion: "contrato.crear",
      entidad: "Contrato",
      entidadId: contrato.id,
      detalle: `Creó contrato "${tipoContrato}" para el cliente ${clienteId}`,
    });

    return { id: contrato.id };
  });
}
