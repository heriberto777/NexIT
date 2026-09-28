"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarClienteSchema } from "@/lib/zod/admin.schema";
import type { EditarClienteInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function editarCliente(input: EditarClienteInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar clientes`);
  }

  const { id, nombre, identificacionFiscal, estado } = editarClienteSchema.parse(input);

  await prisma.cliente.update({
    where: { id },
    data: { nombre, identificacionFiscal: identificacionFiscal || null, estado },
  });

  await registrarAuditoria({ usuario, accion: "cliente.editar", entidad: "Cliente", entidadId: id, detalle: `Editó a ${nombre} (estado ${estado})` });

  return { id };
}
