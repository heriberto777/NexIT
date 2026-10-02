"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarActivoSchema } from "@/lib/zod/admin.schema";
import type { EditarActivoInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarActivo(input: EditarActivoInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede editar activos`);
    }

    const data = editarActivoSchema.parse(input);

    await prisma.activo.update({
      where: { id: data.id },
      data: {
        sucursalId: data.sucursalId,
        categoriaId: data.categoriaId,
        marca: data.marca,
        modelo: data.modelo,
        numeroSerie: data.numeroSerie,
        ubicacionEspecifica: data.ubicacionEspecifica || null,
        fechaInstalacion: data.fechaInstalacion ? new Date(data.fechaInstalacion) : null,
        fechaFinGarantia: data.fechaFinGarantia ? new Date(data.fechaFinGarantia) : null,
        estado: data.estado,
      },
    });

    await registrarAuditoria({
      usuario,
      accion: "activo.editar",
      entidad: "Activo",
      entidadId: data.id,
      detalle: `Editó ${data.marca} ${data.modelo} (estado ${data.estado})`,
    });

    return { id: data.id };
  });
}
