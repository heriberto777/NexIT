"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearClienteSchema } from "@/lib/zod/admin.schema";
import type { CrearClienteInput } from "@/lib/zod/admin.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function crearCliente(input: CrearClienteInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede registrar clientes`);
  }

  const { nombre, identificacionFiscal } = crearClienteSchema.parse(input);

  const cliente = await prisma.cliente.create({
    data: { nombre, identificacionFiscal: identificacionFiscal || undefined },
  });

  return { id: cliente.id };
}
