"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { crearClienteSchema } from "@/lib/zod/admin.schema";
import type { CrearClienteInput } from "@/lib/zod/admin.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearCliente(input: CrearClienteInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede registrar clientes`);
    }

    const { nombre, identificacionFiscal } = crearClienteSchema.parse(input);

    const cliente = await prisma.cliente.create({
      data: { nombre, identificacionFiscal: identificacionFiscal || undefined },
    });

    await registrarAuditoria({ usuario, accion: "cliente.crear", entidad: "Cliente", entidadId: cliente.id, detalle: `Creó a ${nombre}` });

    return { id: cliente.id };
  });
}
