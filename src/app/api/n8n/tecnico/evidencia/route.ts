import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { evidenciaTecnicoSchema } from "@/lib/zod/n8n.schema";
import { storageService } from "@/server/services/storage.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";

export const dynamic = "force-dynamic";

// n8n descarga el archivo de Telegram/Twilio y lo manda ya en base64 — evita que NexIT
// tenga que autenticarse contra la API de Telegram/Twilio para resolver la URL del
// medio, que además expira. La clasificación FOTO_ANTES/FOTO_DESPUES es automática (la
// primera foto del ticket es "antes", el resto "después") porque una foto de chat no
// trae ese dato explícito como sí lo hace el wizard paso a paso.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = evidenciaTecnicoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, numeroTicket, imagenBase64, contentType } = parsed.data;
  const responder = (body: Record<string, unknown>, status: number) => NextResponse.json({ ...body, canal, identificador }, { status });

  const usuario = await resolverUsuarioPorChatId(canal, identificador);
  if (!usuario || usuario.rol !== "TECNICO" || usuario.estado !== "ACTIVO") {
    const { empresaNombre } = await obtenerConfiguracion();
    return responder({ ok: false, error: "USUARIO_NO_VINCULADO", mensaje: `No encontramos tu número vinculado a ${empresaNombre} como técnico.` }, 404);
  }

  const ticket = await prisma.ticket.findUnique({ where: { numeroTicket }, include: { evidencias: true } });
  if (!ticket) {
    return responder({ ok: false, error: "TICKET_NO_ENCONTRADO", mensaje: `No existe el ticket ${numeroTicket}.` }, 404);
  }
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    return responder({ ok: false, error: "TICKET_NO_ASIGNADO", mensaje: `El ticket ${numeroTicket} no está asignado a vos.` }, 403);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(imagenBase64, "base64");
  } catch {
    return responder({ ok: false, error: "IMAGEN_INVALIDA", mensaje: "No se pudo leer la imagen." }, 400);
  }
  if (buffer.length === 0) {
    return responder({ ok: false, error: "IMAGEN_INVALIDA", mensaje: "No se pudo leer la imagen." }, 400);
  }

  const { evidenciaMaxMB } = await obtenerConfiguracion();
  if (buffer.length > evidenciaMaxMB * 1024 * 1024) {
    return responder({ ok: false, error: "IMAGEN_MUY_GRANDE", mensaje: `La foto excede ${evidenciaMaxMB}MB.` }, 413);
  }

  const tieneFotoAntes = ticket.evidencias.some((e) => e.tipo === "FOTO_ANTES");
  const tipo = tieneFotoAntes ? "FOTO_DESPUES" : "FOTO_ANTES";

  const { key } = await storageService.upload({ buffer, contentType, pathPrefix: `tickets/${ticket.id}/evidencias` });

  await prisma.evidencia.create({ data: { ticketId: ticket.id, tipo, urlArchivo: key, usuarioId: usuario.id } });

  return responder(
    { ok: true, mensaje: `Foto guardada en el ticket ${numeroTicket} como "${tipo === "FOTO_ANTES" ? "antes" : "después"}".` },
    200,
  );
}
