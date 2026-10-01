"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { crearSistemaSoftwareSchema } from "@/lib/zod/admin.schema";
import type { CrearSistemaSoftwareInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearSistemaSoftware(input: CrearSistemaSoftwareInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede registrar sistemas de software`);
  }

  const data = crearSistemaSoftwareSchema.parse(input);

  const sistema = await prisma.sistemaSoftware.create({
    data: {
      clienteId: data.clienteId,
      nombre: data.nombre,
      proveedor: data.proveedor || undefined,
    },
  });

  await registrarAuditoria({
    usuario,
    accion: "sistema_software.crear",
    entidad: "SistemaSoftware",
    entidadId: sistema.id,
    detalle: `Creó el sistema "${data.nombre}"`,
  });

  return { id: sistema.id };
}
