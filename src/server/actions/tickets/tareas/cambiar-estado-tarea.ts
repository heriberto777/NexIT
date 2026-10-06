"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cambiarEstadoTareaSchema } from "@/lib/zod/tarea.schema";
import type { CambiarEstadoTareaInput } from "@/lib/zod/tarea.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

// Marcar en progreso/completada queda reservado a quien de verdad tiene la tarea
// asignada (o a Admin/Coordinador como override) — el técnico responsable del ticket NO
// puede completar una tarea que delegó en otra persona solo por ser el responsable.
// Cancelar es la excepción: tanto el asignado como el responsable del ticket pueden
// cancelar una tarea mientras siga PENDIENTE (ej. se dio cuenta de que ya no hace falta
// comprar esa licencia); una vez que alguien empezó a trabajarla, cancelarla queda
// reservado a Admin/Coordinador.
function puedeCambiarEstado(
  usuario: { rol: string; id: string },
  tarea: { asignadoAId: string | null; estado: string },
  ticket: { tecnicoAsignadoId: string | null },
  estadoNuevo: string,
): boolean {
  if (usuario.rol === "ADMIN" || usuario.rol === "COORDINADOR") return true;
  const esAsignado = tarea.asignadoAId === usuario.id;
  if (estadoNuevo === "CANCELADA") {
    const esResponsableTicket = ticket.tecnicoAsignadoId === usuario.id;
    return (esAsignado || esResponsableTicket) && tarea.estado === "PENDIENTE";
  }
  return esAsignado;
}

export async function cambiarEstadoTarea(input: CambiarEstadoTareaInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { tareaId, estado } = cambiarEstadoTareaSchema.parse(input);

    const tarea = await prisma.ticketTarea.findUniqueOrThrow({
      where: { id: tareaId },
      include: { ticket: { select: { tecnicoAsignadoId: true } } },
    });
    if (!puedeCambiarEstado(usuario, tarea, tarea.ticket, estado)) {
      throw new Error("No puedes cambiar el estado de esta tarea");
    }
    if (tarea.estado === estado) {
      throw new Error("La tarea ya está en ese estado");
    }

    await prisma.$transaction([
      prisma.ticketTarea.update({
        where: { id: tareaId },
        data: { estado, fechaCompletada: estado === "COMPLETADA" ? new Date() : null },
      }),
      prisma.ticketTareaActividad.create({
        data: {
          tareaId,
          usuarioId: usuario.id,
          tipo: "CAMBIO_ESTADO",
          estadoAnterior: tarea.estado,
          estadoNuevo: estado,
        },
      }),
    ]);

    return { id: tareaId };
  });
}
