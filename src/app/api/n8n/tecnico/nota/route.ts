import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { notaTecnicoSchema } from "@/lib/zod/n8n.schema";

export const dynamic = "force-dynamic";

// Igual que agregarComentarioTicket (portal): estadoNuevo = el estado actual sin
// cambiarlo, así la nota queda intercalada cronológicamente en el mismo historial que
// los cambios de estado reales, en vez de en una tabla de "chat" aparte.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = notaTecnicoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, numeroTicket, comentario } = parsed.data;
  const responder = (body: Record<string, unknown>, status: number) => NextResponse.json({ ...body, canal, identificador }, { status });

  const usuario = await prisma.usuario.findUnique({
    where: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappTelefono: identificador },
  });
  if (!usuario || usuario.rol !== "TECNICO" || usuario.estado !== "ACTIVO") {
    return responder({ ok: false, error: "USUARIO_NO_VINCULADO", mensaje: "No encontramos tu número vinculado a NexIT como técnico." }, 404);
  }

  const ticket = await prisma.ticket.findUnique({ where: { numeroTicket } });
  if (!ticket) {
    return responder({ ok: false, error: "TICKET_NO_ENCONTRADO", mensaje: `No existe el ticket ${numeroTicket}.` }, 404);
  }
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    return responder({ ok: false, error: "TICKET_NO_ASIGNADO", mensaje: `El ticket ${numeroTicket} no está asignado a vos.` }, 403);
  }

  await prisma.ticketHistorial.create({
    data: {
      ticketId: ticket.id,
      usuarioId: usuario.id,
      estadoNuevo: ticket.estado,
      comentario: `[Nota vía ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"}] ${comentario}`,
    },
  });

  return responder({ ok: true, mensaje: `Anotado en el ticket ${numeroTicket}.` }, 200);
}
