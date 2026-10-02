"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarSucursalSchema } from "@/lib/zod/admin.schema";
import type { EditarSucursalInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarSucursal(input: EditarSucursalInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede editar sucursales`);
    }

    const { id, nombre, direccion, ciudad, contactoNombre, contactoTelefono } = editarSucursalSchema.parse(input);

    await prisma.sucursal.update({
      where: { id },
      data: { nombre, direccion, ciudad, contactoNombre, contactoTelefono },
    });

    await registrarAuditoria({ usuario, accion: "sucursal.editar", entidad: "Sucursal", entidadId: id, detalle: `Editó "${nombre}"` });

    return { id };
  });
}
