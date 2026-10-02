"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { buscarContactosClienteSchema } from "@/lib/zod/ticket.schema";
import type { BuscarContactosClienteInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["ADMIN", "COORDINADOR", "TECNICO"] as const;

interface ContactoEncontrado {
  id: string;
  nombre: string;
  email: string;
  whatsappTelefono: string | null;
}

// Se busca solo por cliente (no por sede): un mismo contacto puede llamar por
// problemas de más de una sucursal de la misma empresa, y Usuario no tiene una sede
// propia — el ticket ya guarda la suya por separado.
export async function buscarContactosCliente(
  input: BuscarContactosClienteInput,
): Promise<ActionResult<ContactoEncontrado[]>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede buscar contactos`);
    }

    const { clienteId, query } = buscarContactosClienteSchema.parse(input);
    if (query.length < 2) return [];

    const contactos = await prisma.usuario.findMany({
      where: {
        clienteId,
        rol: "CLIENTE",
        estado: "ACTIVO",
        OR: [{ nombre: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }],
      },
      orderBy: { nombre: "asc" },
      take: 8,
      select: { id: true, nombre: true, email: true, whatsappTelefono: true },
    });

    return contactos;
  });
}
