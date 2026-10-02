"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarEspecialidadSchema } from "@/lib/zod/admin.schema";
import type { EditarEspecialidadInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarEspecialidad(input: EditarEspecialidadInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar especialidades`);
  }

  const { id, nombre } = editarEspecialidadSchema.parse(input);

  try {
    const especialidad = await prisma.especialidad.update({ where: { id }, data: { nombre } });
    await registrarAuditoria({ usuario, accion: "especialidad.editar", entidad: "Especialidad", entidadId: id, detalle: `Renombró a "${nombre}"` });
    return { id: especialidad.id, nombre: especialidad.nombre };
  } catch (error) {
    if (error instanceof Object && "code" in error && error.code === "P2002") {
      throw new Error(`Ya existe una especialidad llamada "${nombre}"`);
    }
    throw error;
  }
}
