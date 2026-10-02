"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { marcarRespuestaIaValidaSchema } from "@/lib/zod/ia-chat.schema";
import type { MarcarRespuestaIaValidaInput } from "@/lib/zod/ia-chat.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

export async function marcarRespuestaIaValida(input: MarcarRespuestaIaValidaInput): Promise<ActionResult<{ ok: true }>> {
  return ejecutarAccion(async () => {
    // Sin restricción de rol acá: un Admin/Coordinador puede estar asignado como
    // "técnico" de este ticket (ver asignar-tecnico.ts) y ejecutar el wizard él mismo —
    // la propiedad (el chequeo de abajo), no el rol, es lo que habilita cada paso.
    const usuario = await requireUsuario();
    const { mensajeId } = marcarRespuestaIaValidaSchema.parse(input);

    const mensaje = await prisma.mensajeTicketIA.findUniqueOrThrow({
      where: { id: mensajeId },
      include: { conversacion: { include: { ticket: true } } },
    });
    if (mensaje.conversacion.ticket.tecnicoAsignadoId !== usuario.id) {
      throw new Error("Este ticket no está asignado a este técnico");
    }
    if (mensaje.rol !== "ASISTENTE") {
      throw new Error("Solo se puede marcar como solución una respuesta de la IA");
    }

    // A lo sumo una respuesta marcada por conversación — desmarca cualquier otra antes.
    await prisma.$transaction([
      prisma.mensajeTicketIA.updateMany({
        where: { conversacionId: mensaje.conversacionId, esSolucion: true },
        data: { esSolucion: false },
      }),
      prisma.mensajeTicketIA.update({ where: { id: mensajeId }, data: { esSolucion: true } }),
    ]);

    return { ok: true };
  });
}
