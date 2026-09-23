"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearSucursalSchema } from "@/lib/zod/admin.schema";
import type { CrearSucursalInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearSucursal(input: CrearSucursalInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede registrar sucursales`);
  }

  const { clienteId, nombre, direccion, ciudad, contactoNombre, contactoTelefono } =
    crearSucursalSchema.parse(input);

  const sucursal = await prisma.sucursal.create({
    data: { clienteId, nombre, direccion, ciudad, contactoNombre, contactoTelefono },
  });

  return { id: sucursal.id };
}
