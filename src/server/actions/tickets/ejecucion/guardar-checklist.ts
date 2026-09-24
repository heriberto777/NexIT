"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { guardarChecklistSchema } from "@/lib/zod/checklist.schema";
import type { GuardarChecklistInput } from "@/lib/zod/checklist.schema";

// Paso 2: guarda (upsert) las respuestas del checklist dinámico del activo.
// Se llama una vez por ítem respondido (autoguardado) o en batch al avanzar de paso.
export async function guardarChecklist(input: GuardarChecklistInput) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId, respuestas } = guardarChecklistSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  await prisma.$transaction(
    respuestas.map((r) =>
      prisma.ticketChecklistRespuesta.upsert({
        where: { ticketId_checklistItemId: { ticketId, checklistItemId: r.checklistItemId } },
        create: {
          ticketId,
          checklistItemId: r.checklistItemId,
          respuesta: String(r.respuesta),
          observacion: r.observacion,
          fotoArchivo: r.fotoArchivo,
        },
        update: {
          respuesta: String(r.respuesta),
          observacion: r.observacion,
          fotoArchivo: r.fotoArchivo,
        },
      }),
    ),
  );

  await prisma.ticketHistorial.create({
    data: {
      ticketId,
      usuarioId: usuario.id,
      estadoNuevo: "EN_DIAGNOSTICO",
      comentario:
        respuestas.length > 0 ? `Checklist actualizado (${respuestas.length} ítems)` : "Sin checklist aplicable para este ticket",
    },
  });

  return { guardados: respuestas.length };
}
