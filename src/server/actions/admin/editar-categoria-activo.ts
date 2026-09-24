"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { editarCategoriaActivoSchema } from "@/lib/zod/admin.schema";
import type { EditarCategoriaActivoInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarCategoriaActivo(input: EditarCategoriaActivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar categorías de activo`);
  }

  const { id, nombre } = editarCategoriaActivoSchema.parse(input);

  try {
    const categoria = await prisma.categoriaActivo.update({ where: { id }, data: { nombre } });
    return { id: categoria.id, nombre: categoria.nombre };
  } catch (error) {
    // P2002: violación de @unique en `nombre` — ya existe otra categoría con ese nombre.
    if (error instanceof Object && "code" in error && error.code === "P2002") {
      throw new Error(`Ya existe una categoría llamada "${nombre}"`);
    }
    throw error;
  }
}
