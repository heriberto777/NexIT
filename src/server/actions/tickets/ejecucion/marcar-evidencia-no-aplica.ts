"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { marcarEvidenciaNoAplicaSchema } from "@/lib/zod/evidencia.schema";
import type { MarcarEvidenciaNoAplicaInput } from "@/lib/zod/evidencia.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

// Paso 3 (excepción): no todo ticket deja algo fotografiable — el técnico decide caso
// por caso, con un motivo obligatorio que queda en el historial para que
// Coordinador/Admin puedan auditarlo después (sin bloquear el cierre en el momento).
// finalizar-visita.ts salta el mínimo de fotos cuando este flag es true.
export async function marcarEvidenciaNoAplica(input: MarcarEvidenciaNoAplicaInput): Promise<ActionResult<{ ok: true }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario("TECNICO");
    const { ticketId, motivo } = marcarEvidenciaNoAplicaSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ticket.tecnicoAsignadoId !== usuario.id) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { evidenciaNoAplica: true, evidenciaNoAplicaMotivo: motivo },
      }),
      prisma.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoNuevo: ticket.estado,
          comentario: `Marcó que este ticket no requiere evidencia fotográfica. Motivo: ${motivo}`,
        },
      }),
    ]);

    return { ok: true };
  });
}
