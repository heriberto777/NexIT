"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { guardarRepuestoSchema } from "@/lib/zod/inventario.schema";
import type { GuardarRepuestoInput } from "@/lib/zod/inventario.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function guardarRepuesto(input: GuardarRepuestoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede administrar el inventario`);
  }

  const { id, stockInicial, ...data } = guardarRepuestoSchema.parse(input);

  if (id) {
    const repuesto = await prisma.repuesto.update({ where: { id }, data });
    return { id: repuesto.id };
  }

  return prisma.$transaction(async (tx) => {
    const repuesto = await tx.repuesto.create({ data: { ...data, stockActual: stockInicial ?? 0 } });

    if (stockInicial && stockInicial > 0) {
      await tx.movimientoInventario.create({
        data: {
          repuestoId: repuesto.id,
          tipo: "ENTRADA",
          cantidad: stockInicial,
          motivo: "Carga inicial de inventario",
          usuarioId: usuario.id,
        },
      });
    }

    return { id: repuesto.id };
  });
}
