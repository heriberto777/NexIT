"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cambiarEstadoUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { CambiarEstadoUsuarioInput } from "@/lib/zod/usuario.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

// Desactivar un usuario no lo borra (preserva su historial, tickets creados/asignados,
// evidencias, etc.) — solo le bloquea el login: src/auth.ts ya rechaza cualquier
// usuario con estado != ACTIVO en authorize().
export async function cambiarEstadoUsuario(input: CambiarEstadoUsuarioInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede cambiar el estado de usuarios`);
  }

  const { id, estado } = cambiarEstadoUsuarioSchema.parse(input);

  if (id === usuario.id && estado === "INACTIVO") {
    throw new Error("No puedes desactivar tu propia cuenta");
  }

  const actualizado = await prisma.usuario.update({ where: { id }, data: { estado } });
  return { id: actualizado.id, estado: actualizado.estado };
}
