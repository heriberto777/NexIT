"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearCategoriaActivoSchema } from "@/lib/zod/admin.schema";
import type { CrearCategoriaActivoInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearCategoriaActivo(input: CrearCategoriaActivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede crear categorías de activo`);
  }

  const { nombre } = crearCategoriaActivoSchema.parse(input);

  const categoria = await prisma.categoriaActivo.upsert({
    where: { nombre },
    update: {},
    create: { nombre },
  });

  return { id: categoria.id, nombre: categoria.nombre };
}
