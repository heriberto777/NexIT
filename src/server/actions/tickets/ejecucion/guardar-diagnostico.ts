"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { diagnosticoSchema } from "@/lib/zod/checklist.schema";
import type { DiagnosticoInput } from "@/lib/zod/checklist.schema";

// Paso 1 (continuación): guarda los hallazgos del diagnóstico antes de avanzar al checklist.
export async function guardarDiagnostico(input: DiagnosticoInput) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId, hallazgos, causaRaizIdentificada } = diagnosticoSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  await prisma.ticketHistorial.create({
    data: {
      ticketId,
      usuarioId: usuario.id,
      estadoNuevo: "EN_DIAGNOSTICO",
      comentario: `Diagnóstico: ${hallazgos} (causa raíz ${causaRaizIdentificada ? "identificada" : "no identificada"})`,
    },
  });

  return { ok: true };
}
