"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { guardarPlanPreventivoSchema } from "@/lib/zod/plan-preventivo.schema";
import type { GuardarPlanPreventivoInput } from "@/lib/zod/plan-preventivo.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function guardarPlanPreventivo(input: GuardarPlanPreventivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede administrar planes preventivos`);
  }

  const { id, titulo, descripcion, activoId, sucursalId, frecuencia, proximaFecha, tecnicoAsignadoId, prioridad } =
    guardarPlanPreventivoSchema.parse(input);

  const data = {
    titulo,
    descripcion: descripcion || undefined,
    activoId: activoId || null,
    sucursalId: sucursalId || null,
    frecuencia,
    proximaFecha: new Date(proximaFecha),
    tecnicoAsignadoId: tecnicoAsignadoId || null,
    prioridad,
  };

  const plan = id
    ? await prisma.planMantenimientoPreventivo.update({ where: { id }, data })
    : await prisma.planMantenimientoPreventivo.create({ data });

  return { id: plan.id };
}
