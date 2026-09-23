"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearActivoSchema } from "@/lib/zod/admin.schema";
import type { CrearActivoInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearActivo(input: CrearActivoInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede registrar activos`);
  }

  const data = crearActivoSchema.parse(input);

  const activo = await prisma.activo.create({
    data: {
      sucursalId: data.sucursalId,
      categoriaId: data.categoriaId,
      marca: data.marca,
      modelo: data.modelo,
      numeroSerie: data.numeroSerie,
      ubicacionEspecifica: data.ubicacionEspecifica || undefined,
      fechaInstalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : undefined,
      fechaFinGarantia: data.fechaFinGarantia ? new Date(data.fechaFinGarantia) : undefined,
    },
  });

  return { id: activo.id };
}
