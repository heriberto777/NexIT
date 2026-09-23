"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarMovimientoManualSchema } from "@/lib/zod/inventario.schema";
import type { RegistrarMovimientoManualInput } from "@/lib/zod/inventario.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function registrarMovimientoInventario(input: RegistrarMovimientoManualInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede administrar el inventario`);
  }

  const { repuestoId, tipo, cantidad, motivo } = registrarMovimientoManualSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    // Update atómico: la condición "no queda en negativo" se evalúa en el WHERE contra
    // el stock real al momento del UPDATE, no contra una lectura previa — dos ajustes
    // concurrentes sobre el mismo repuesto ya no pueden pasar ambos un chequeo hecho
    // sobre la misma lectura obsoleta. `gte: -cantidad` cubre ambos casos: para una
    // ENTRADA (cantidad positiva) la condición es trivialmente cierta; para un AJUSTE
    // negativo, exige que el stock actual alcance para no cruzar cero.
    const resultado = await tx.repuesto.updateMany({
      where: { id: repuestoId, stockActual: { gte: -cantidad } },
      data: { stockActual: { increment: cantidad } },
    });

    if (resultado.count === 0) {
      const actual = await tx.repuesto.findUniqueOrThrow({ where: { id: repuestoId } });
      throw new Error(`El movimiento dejaría el stock en negativo (actual: ${actual.stockActual})`);
    }

    const repuesto = await tx.repuesto.findUniqueOrThrow({ where: { id: repuestoId } });

    await tx.movimientoInventario.create({
      data: { repuestoId, tipo, cantidad, motivo, usuarioId: usuario.id },
    });

    return { id: repuesto.id, stockActual: repuesto.stockActual };
  });
}
