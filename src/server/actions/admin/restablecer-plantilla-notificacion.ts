"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { restablecerPlantillaNotificacionSchema } from "@/lib/zod/admin.schema";
import type { RestablecerPlantillaNotificacionInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function restablecerPlantillaNotificacion(input: RestablecerPlantillaNotificacionInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar plantillas de notificación`);
  }

  const { clave } = restablecerPlantillaNotificacionSchema.parse(input);

  // deleteMany (no delete) para que restablecer algo que nunca tuvo override no reviente.
  await prisma.plantillaNotificacion.deleteMany({ where: { clave } });
  await registrarAuditoria({ usuario, accion: "plantilla_notificacion.restablecer", entidad: "PlantillaNotificacion", entidadId: clave, detalle: `Restableció el mensaje de "${clave}" al valor por defecto` });

  return { clave };
}
