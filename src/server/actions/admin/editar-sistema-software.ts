"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarSistemaSoftwareSchema } from "@/lib/zod/admin.schema";
import type { EditarSistemaSoftwareInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarSistemaSoftware(input: EditarSistemaSoftwareInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar sistemas de software`);
  }

  const data = editarSistemaSoftwareSchema.parse(input);

  await prisma.sistemaSoftware.update({
    where: { id: data.id },
    data: {
      nombre: data.nombre,
      proveedor: data.proveedor || null,
      estado: data.estado,
    },
  });

  await registrarAuditoria({
    usuario,
    accion: "sistema_software.editar",
    entidad: "SistemaSoftware",
    entidadId: data.id,
    detalle: `Editó "${data.nombre}" (estado ${data.estado})`,
  });

  return { id: data.id };
}
