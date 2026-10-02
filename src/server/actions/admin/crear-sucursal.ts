"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { crearSucursalSchema } from "@/lib/zod/admin.schema";
import type { CrearSucursalInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearSucursal(input: CrearSucursalInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede registrar sucursales`);
    }

    const { clienteId, nombre, direccion, ciudad, contactoNombre, contactoTelefono } =
      crearSucursalSchema.parse(input);

    const sucursal = await prisma.sucursal.create({
      data: { clienteId, nombre, direccion, ciudad, contactoNombre, contactoTelefono },
    });

    await registrarAuditoria({
      usuario,
      accion: "sucursal.crear",
      entidad: "Sucursal",
      entidadId: sucursal.id,
      detalle: `Creó "${nombre}" para el cliente ${clienteId}`,
    });

    return { id: sucursal.id };
  });
}
