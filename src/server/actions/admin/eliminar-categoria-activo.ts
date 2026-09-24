"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { eliminarCategoriaActivoSchema } from "@/lib/zod/admin.schema";
import type { EliminarCategoriaActivoInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function eliminarCategoriaActivo(input: EliminarCategoriaActivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede eliminar categorías de activo`);
  }

  const { id } = eliminarCategoriaActivoSchema.parse(input);

  // Chequeo explícito en vez de dejar que Postgres tire el error de FK (Activo.categoriaId
  // y ChecklistTemplate.categoriaActivoId son onDelete: Restrict por defecto) — así el
  // mensaje le dice al admin CUÁNTOS registros la están usando, no solo que falló.
  const [activos, templates] = await Promise.all([
    prisma.activo.count({ where: { categoriaId: id } }),
    prisma.checklistTemplate.count({ where: { categoriaActivoId: id } }),
  ]);
  if (activos > 0 || templates > 0) {
    const partes = [
      activos > 0 ? `${activos} activo(s)` : null,
      templates > 0 ? `${templates} checklist(s)` : null,
    ].filter(Boolean);
    throw new Error(`No se puede eliminar: está en uso por ${partes.join(" y ")}.`);
  }

  await prisma.categoriaActivo.delete({ where: { id } });
  return { ok: true };
}
