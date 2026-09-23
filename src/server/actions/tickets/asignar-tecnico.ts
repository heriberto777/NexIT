"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { asignarTicketSchema } from "@/lib/zod/ticket.schema";
import type { AsignarTicketInput } from "@/lib/zod/ticket.schema";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

// Cubre tanto la primera asignación (ABIERTO -> ASIGNADO) como una reasignación a otro
// técnico en cualquier estado posterior — en ese segundo caso el estado del ticket no
// cambia, solo el técnico responsable.
export async function asignarTecnico(input: AsignarTicketInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede asignar técnicos`);
  }

  const { ticketId, tecnicoId } = asignarTicketSchema.parse(input);

  const [ticket, tecnico] = await Promise.all([
    prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    prisma.usuario.findUniqueOrThrow({ where: { id: tecnicoId } }),
  ]);

  if (ESTADOS_TERMINALES.has(ticket.estado)) {
    throw new Error(`No se puede reasignar un ticket en estado ${ticket.estado}`);
  }
  if (tecnico.rol !== "TECNICO") {
    throw new Error("El usuario seleccionado no tiene rol Técnico");
  }

  const esPrimeraAsignacion = ticket.estado === "ABIERTO";
  const estadoNuevo = esPrimeraAsignacion ? "ASIGNADO" : ticket.estado;

  const actualizado = await prisma.$transaction(async (tx) => {
    const ticketActualizado = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        tecnicoAsignadoId: tecnicoId,
        estado: estadoNuevo,
        fechaAsignacion: ticket.fechaAsignacion ?? new Date(),
      },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoAnterior: ticket.estado,
        estadoNuevo,
        comentario: ticket.tecnicoAsignadoId
          ? `Reasignado a ${tecnico.nombre}`
          : `Asignado a ${tecnico.nombre}`,
      },
    });

    return ticketActualizado;
  });

  return { id: actualizado.id, estado: actualizado.estado };
}
