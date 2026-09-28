"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { editarSucursalSchema } from "@/lib/zod/admin.schema";
import type { EditarSucursalInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarSucursal(input: EditarSucursalInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar sucursales`);
  }

  const { id, nombre, direccion, ciudad, contactoNombre, contactoTelefono } = editarSucursalSchema.parse(input);

  await prisma.sucursal.update({
    where: { id },
    data: { nombre, direccion, ciudad, contactoNombre, contactoTelefono },
  });

  return { id };
}
