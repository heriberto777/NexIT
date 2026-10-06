"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearTareaSchema } from "@/lib/zod/tarea.schema";
import type { CrearTareaInput } from "@/lib/zod/tarea.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { asegurarColaborador } from "@/server/services/ticket-acceso.service";
import { notificarTareaAsignada } from "@/server/services/notificacion.service";

// Mismo criterio que "Gestionar ticket" en la página de detalle: Admin/Coordinador
// siempre, o el técnico responsable de ESE ticket puntual — es quien primero detecta,
// durante la visita, que hace falta comprar algo o delegar un trabajo aparte.
function puedeCrearTarea(usuario: { rol: string; id: string }, ticket: { tecnicoAsignadoId: string | null }): boolean {
  return usuario.rol === "ADMIN" || usuario.rol === "COORDINADOR" || ticket.tecnicoAsignadoId === usuario.id;
}

export async function crearTarea(input: CrearTareaInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { ticketId, titulo, asignadoAId } = crearTareaSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { id: true, numeroTicket: true, tecnicoAsignadoId: true },
    });
    if (!puedeCrearTarea(usuario, ticket)) {
      throw new Error("No puedes crear tareas en este ticket");
    }

    if (asignadoAId) {
      const candidato = await prisma.usuario.findUnique({ where: { id: asignadoAId }, select: { rol: true } });
      if (!candidato || candidato.rol === "CLIENTE") {
        throw new Error("No se puede asignar una tarea a ese usuario");
      }
    }

    const tarea = await prisma.$transaction(async (tx) => {
      const nuevaTarea = await tx.ticketTarea.create({
        data: { ticketId, titulo, asignadoAId, creadoPorId: usuario.id },
      });

      await tx.ticketTareaActividad.create({
        data: {
          tareaId: nuevaTarea.id,
          usuarioId: usuario.id,
          tipo: "CREACION",
          comentario: asignadoAId ? null : "Tarea creada sin asignar",
        },
      });

      if (asignadoAId) {
        await asegurarColaborador(tx, ticketId, asignadoAId, ticket.tecnicoAsignadoId);
      }

      return nuevaTarea;
    });

    if (asignadoAId && asignadoAId !== usuario.id) {
      await notificarTareaAsignada(ticket, tarea, asignadoAId);
    }

    return { id: tarea.id };
  });
}
