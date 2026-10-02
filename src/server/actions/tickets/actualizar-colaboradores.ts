"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { actualizarColaboradoresSchema } from "@/lib/zod/ticket.schema";
import type { ActualizarColaboradoresInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;
// Mismo criterio que asignar-tecnico.ts: un colaborador puede ser Técnico, pero también
// un Coordinador/Admin que se suma a ayudar sin ser el responsable del ticket.
const ROLES_ASIGNABLES = ["TECNICO", "COORDINADOR", "ADMIN"] as const;

// Opción A del análisis "¿un ticket puede tener varios técnicos?": esto NO reasigna el
// responsable (tecnicoAsignadoId, ver asignar-tecnico.ts) — solo agrega/quita gente que
// puede entrar al wizard de ejecución a ayudar. Reemplaza el conjunto completo, igual
// que editar-usuario.ts hace con especialidadIds (deleteMany + create, no un diff).
export async function actualizarColaboradoresTicket(input: ActualizarColaboradoresInput): Promise<ActionResult<{ ok: true }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede modificar colaboradores`);
    }

    const { ticketId, usuarioIds } = actualizarColaboradoresSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });

    // El responsable ya tiene acceso por ser el dueño — no tiene sentido duplicarlo
    // también como colaborador.
    const idsFiltrados = [...new Set(usuarioIds)].filter((id) => id !== ticket.tecnicoAsignadoId);

    if (idsFiltrados.length > 0) {
      const candidatos = await prisma.usuario.findMany({
        where: { id: { in: idsFiltrados } },
        select: { id: true, rol: true },
      });
      if (candidatos.length !== idsFiltrados.length) {
        throw new Error("Uno de los usuarios seleccionados no existe");
      }
      if (candidatos.some((c) => !ROLES_ASIGNABLES.includes(c.rol as (typeof ROLES_ASIGNABLES)[number]))) {
        throw new Error("Uno de los usuarios seleccionados no puede ser colaborador de un ticket");
      }
    }

    await prisma.$transaction([
      prisma.ticketColaborador.deleteMany({ where: { ticketId } }),
      ...(idsFiltrados.length > 0
        ? [prisma.ticketColaborador.createMany({ data: idsFiltrados.map((usuarioId) => ({ ticketId, usuarioId })) })]
        : []),
      prisma.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoNuevo: ticket.estado,
          comentario:
            idsFiltrados.length > 0 ? `Colaboradores actualizados (${idsFiltrados.length})` : "Se quitaron todos los colaboradores",
        },
      }),
    ]);

    return { ok: true };
  });
}
