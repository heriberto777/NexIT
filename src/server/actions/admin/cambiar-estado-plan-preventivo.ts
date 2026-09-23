"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cambiarEstadoPlanPreventivoSchema } from "@/lib/zod/plan-preventivo.schema";
import type { CambiarEstadoPlanPreventivoInput } from "@/lib/zod/plan-preventivo.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function cambiarEstadoPlanPreventivo(input: CambiarEstadoPlanPreventivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede administrar planes preventivos`);
  }

  const { id, estado } = cambiarEstadoPlanPreventivoSchema.parse(input);
  await prisma.planMantenimientoPreventivo.update({ where: { id }, data: { estado } });

  return { id, estado };
}
