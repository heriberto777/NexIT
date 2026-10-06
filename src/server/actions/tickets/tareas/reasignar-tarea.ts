"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { reasignarTareaSchema } from "@/lib/zod/tarea.schema";
import type { ReasignarTareaInput } from "@/lib/zod/tarea.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { asegurarColaborador } from "@/server/services/ticket-acceso.service";
import { notificarTareaAsignada } from "@/server/services/notificacion.service";

function puedeReasignar(usuario: { rol: string; id: string }, ticket: { tecnicoAsignadoId: string | null }): boolean {
  return usuario.rol === "ADMIN" || usuario.rol === "COORDINADOR" || ticket.tecnicoAsignadoId === usuario.id;
}

export async function reasignarTarea(input: ReasignarTareaInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { tareaId, asignadoAId } = reasignarTareaSchema.parse(input);

    const tarea = await prisma.ticketTarea.findUniqueOrThrow({
      where: { id: tareaId },
      include: { ticket: { select: { id: true, numeroTicket: true, tecnicoAsignadoId: true } } },
    });
    if (!puedeReasignar(usuario, tarea.ticket)) {
      throw new Error("No puedes reasignar tareas en este ticket");
    }
    if (asignadoAId === tarea.asignadoAId) {
      throw new Error("La tarea ya está asignada a esa persona");
    }

    if (asignadoAId) {
      const candidato = await prisma.usuario.findUnique({ where: { id: asignadoAId }, select: { rol: true } });
      if (!candidato || candidato.rol === "CLIENTE") {
        throw new Error("No se puede asignar una tarea a ese usuario");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.ticketTarea.update({ where: { id: tareaId }, data: { asignadoAId } });

      await tx.ticketTareaActividad.create({
        data: {
          tareaId,
          usuarioId: usuario.id,
          tipo: "REASIGNACION",
          comentario: asignadoAId ? null : "Se quitó la asignación de la tarea",
        },
      });

      if (asignadoAId) {
        await asegurarColaborador(tx, tarea.ticket.id, asignadoAId, tarea.ticket.tecnicoAsignadoId);
      }
    });

    if (asignadoAId && asignadoAId !== usuario.id) {
      await notificarTareaAsignada(tarea.ticket, tarea, asignadoAId);
    }

    return { id: tareaId };
  });
}
