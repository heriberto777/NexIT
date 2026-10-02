"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { guardarPlantillaNotificacionSchema } from "@/lib/zod/admin.schema";
import type { GuardarPlantillaNotificacionInput } from "@/lib/zod/admin.schema";
import { obtenerDefinicion } from "@/server/services/plantilla-notificacion.service";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function guardarPlantillaNotificacion(input: GuardarPlantillaNotificacionInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar plantillas de notificación`);
  }

  const { clave, cuerpo } = guardarPlantillaNotificacionSchema.parse(input);

  // `clave` solo puede ser una de las fijas en el catálogo en código — nunca se crea
  // una plantilla "suelta" que ningún evento vaya a renderizar.
  if (!obtenerDefinicion(clave)) {
    throw new Error(`"${clave}" no es una plantilla válida`);
  }

  await prisma.plantillaNotificacion.upsert({
    where: { clave },
    create: { clave, cuerpo },
    update: { cuerpo },
  });
  await registrarAuditoria({ usuario, accion: "plantilla_notificacion.guardar", entidad: "PlantillaNotificacion", entidadId: clave, detalle: `Personalizó el mensaje de "${clave}"` });

  return { clave, cuerpo };
}
