"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { enviarMensajeIaSchema } from "@/lib/zod/ia-chat.schema";
import type { EnviarMensajeIaInput } from "@/lib/zod/ia-chat.schema";
import { generarRespuestaIA, type MensajeIA } from "@/server/services/ia.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import type { MensajeIaPlano } from "@/types/ejecucion";

// Arma el contexto del ticket que acompaña cada mensaje como system prompt — nunca se
// persiste, se reconstruye en cada turno para que siempre refleje el estado más
// reciente del ticket (ej. si el técnico ya cargó el diagnóstico o el checklist).
async function construirContexto(ticketId: string): Promise<string> {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: {
      cliente: true,
      activo: true,
      checklistRespuestas: { include: { checklistItem: true } },
      historial: { orderBy: { fecha: "desc" }, take: 10 },
    },
  });

  const partes = [
    `Sos un asistente técnico que ayuda a un técnico de campo a diagnosticar y resolver un ticket de soporte. Respondé en español, de forma breve y concreta — pasos accionables, no teoría general.`,
    `Ticket #${ticket.numeroTicket} — ${ticket.titulo}`,
    `Descripción del problema: ${ticket.descripcion}`,
    `Prioridad: ${ticket.prioridad} · Categoría: ${ticket.categoriaSoporte}`,
    `Cliente: ${ticket.cliente.nombre}`,
  ];

  if (ticket.activo) {
    partes.push(`Equipo: ${ticket.activo.marca} ${ticket.activo.modelo} (Serie #${ticket.activo.numeroSerie})`);
  }

  const diagnostico = ticket.historial.find((h) => h.comentario?.startsWith("Diagnóstico:"));
  if (diagnostico?.comentario) {
    partes.push(`Diagnóstico ya cargado por el técnico: ${diagnostico.comentario.replace("Diagnóstico: ", "")}`);
  }

  if (ticket.checklistRespuestas.length > 0) {
    const checklist = ticket.checklistRespuestas
      .map((r) => `- ${r.checklistItem.descripcion}: ${r.respuesta}${r.observacion ? ` (${r.observacion})` : ""}`)
      .join("\n");
    partes.push(`Checklist respondido hasta ahora:\n${checklist}`);
  }

  if (ticket.activo) {
    const ticketsPrevios = await prisma.ticket.findMany({
      where: { activoId: ticket.activo.id, id: { not: ticket.id }, estado: { in: ["RESUELTO", "CERRADO"] } },
      orderBy: { fechaCierre: "desc" },
      take: 3,
      select: { numeroTicket: true, titulo: true },
    });
    if (ticketsPrevios.length > 0) {
      partes.push(`Tickets anteriores resueltos en este mismo equipo (puede ser una falla recurrente):\n${ticketsPrevios.map((t) => `- #${t.numeroTicket}: ${t.titulo}`).join("\n")}`);
    }
  }

  return partes.join("\n\n");
}

function aPlano(m: { id: string; rol: string; contenido: string; esSolucion: boolean; createdAt: Date }): MensajeIaPlano {
  return { id: m.id, rol: m.rol as "USUARIO" | "ASISTENTE", contenido: m.contenido, esSolucion: m.esSolucion, createdAt: m.createdAt.toISOString() };
}

export async function enviarMensajeIA(
  input: EnviarMensajeIaInput,
): Promise<ActionResult<{ mensajeUsuario: MensajeIaPlano; mensajeAsistente: MensajeIaPlano }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario("TECNICO");
    const { ticketId, mensaje } = enviarMensajeIaSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ticket.tecnicoAsignadoId !== usuario.id) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    const conversacion = await prisma.conversacionTicketIA.upsert({
      where: { ticketId },
      update: {},
      create: { ticketId },
    });

    const mensajeUsuario = await prisma.mensajeTicketIA.create({
      data: { conversacionId: conversacion.id, rol: "USUARIO", contenido: mensaje },
    });

    const historialPrevio = await prisma.mensajeTicketIA.findMany({
      where: { conversacionId: conversacion.id },
      orderBy: { createdAt: "asc" },
    });
    const historialParaModelo: MensajeIA[] = historialPrevio.map((m) => ({ rol: m.rol as "USUARIO" | "ASISTENTE", contenido: m.contenido }));

    const systemPrompt = await construirContexto(ticketId);
    const respuesta = await generarRespuestaIA(systemPrompt, historialParaModelo);

    const mensajeAsistente = await prisma.mensajeTicketIA.create({
      data: { conversacionId: conversacion.id, rol: "ASISTENTE", contenido: respuesta },
    });

    return { mensajeUsuario: aPlano(mensajeUsuario), mensajeAsistente: aPlano(mensajeAsistente) };
  });
}
