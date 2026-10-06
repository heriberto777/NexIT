"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { comentarTareaSchema } from "@/lib/zod/tarea.schema";
import type { ComentarTareaInput } from "@/lib/zod/tarea.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { tieneAccesoAlTicket, asegurarColaborador, INCLUDE_COLABORADORES } from "@/server/services/ticket-acceso.service";
import { notificarComentarioTarea, notificarMencionTarea } from "@/server/services/notificacion.service";

function puedeComentar(usuario: { rol: string; id: string }, ticket: { tecnicoAsignadoId: string | null; colaboradores: { usuarioId: string }[] }): boolean {
  return usuario.rol === "ADMIN" || usuario.rol === "COORDINADOR" || tieneAccesoAlTicket(ticket, usuario.id);
}

export async function comentarTarea(input: ComentarTareaInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { tareaId, comentario, fotoArchivo, mencionadosIds } = comentarTareaSchema.parse(input);

    const tarea = await prisma.ticketTarea.findUniqueOrThrow({
      where: { id: tareaId },
      include: { ticket: { select: { id: true, numeroTicket: true, tecnicoAsignadoId: true, ...INCLUDE_COLABORADORES } } },
    });
    if (!puedeComentar(usuario, tarea.ticket)) {
      throw new Error("No tienes acceso a esta tarea");
    }

    const idsMencionUnicos = [...new Set(mencionadosIds)].filter((id) => id !== usuario.id);
    if (idsMencionUnicos.length > 0) {
      const candidatos = await prisma.usuario.findMany({ where: { id: { in: idsMencionUnicos } }, select: { id: true, rol: true } });
      if (candidatos.length !== idsMencionUnicos.length || candidatos.some((c) => c.rol === "CLIENTE")) {
        throw new Error("No se puede mencionar a uno de los usuarios seleccionados");
      }
    }

    await prisma.$transaction(async (tx) => {
      const actividad = await tx.ticketTareaActividad.create({
        data: { tareaId, usuarioId: usuario.id, tipo: "COMENTARIO", comentario, fotoArchivo },
      });

      if (idsMencionUnicos.length > 0) {
        await tx.ticketTareaMencion.createMany({
          data: idsMencionUnicos.map((usuarioId) => ({ actividadId: actividad.id, usuarioId })),
        });
        for (const mencionadoId of idsMencionUnicos) {
          await asegurarColaborador(tx, tarea.ticket.id, mencionadoId, tarea.ticket.tecnicoAsignadoId);
        }
      }
    });

    // "El otro lado" de la conversación (quien creó la tarea y a quién está asignada) —
    // sin duplicar aviso a quien ya se notifica más específicamente por mención, ni al
    // propio autor del comentario.
    const destinatarios = new Set([tarea.creadoPorId, tarea.asignadoAId].filter((id): id is string => Boolean(id)));
    destinatarios.delete(usuario.id);
    for (const id of idsMencionUnicos) destinatarios.delete(id);

    for (const destinatarioId of destinatarios) {
      await notificarComentarioTarea(tarea.ticket, tarea, usuario.nombre, destinatarioId);
    }
    for (const mencionadoId of idsMencionUnicos) {
      await notificarMencionTarea(tarea.ticket, tarea, usuario.nombre, mencionadoId);
    }

    return { id: tareaId };
  });
}
