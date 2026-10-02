"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { crearEspecialidadSchema } from "@/lib/zod/admin.schema";
import type { CrearEspecialidadInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearEspecialidad(input: CrearEspecialidadInput): Promise<ActionResult<{ id: string; nombre: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede crear especialidades`);
    }

    const { nombre } = crearEspecialidadSchema.parse(input);

    const especialidad = await prisma.especialidad.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });

    await registrarAuditoria({ usuario, accion: "especialidad.crear", entidad: "Especialidad", entidadId: especialidad.id, detalle: nombre });

    return { id: especialidad.id, nombre: especialidad.nombre };
  });
}
