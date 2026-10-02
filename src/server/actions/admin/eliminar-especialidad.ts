"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { eliminarEspecialidadSchema } from "@/lib/zod/admin.schema";
import type { EliminarEspecialidadInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function eliminarEspecialidad(input: EliminarEspecialidadInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede eliminar especialidades`);
  }

  const { id } = eliminarEspecialidadSchema.parse(input);

  // Chequeo explícito en vez de dejar que Postgres tire el error de FK (RESTRICT por
  // defecto) — así el mensaje le dice al admin a cuántos técnicos afecta.
  const usuarios = await prisma.usuarioEspecialidad.count({ where: { especialidadId: id } });
  if (usuarios > 0) {
    throw new Error(`No se puede eliminar: está asignada a ${usuarios} usuario(s).`);
  }

  const eliminada = await prisma.especialidad.delete({ where: { id } });

  await registrarAuditoria({ usuario, accion: "especialidad.eliminar", entidad: "Especialidad", entidadId: id, detalle: eliminada.nombre });

  return { ok: true };
}
