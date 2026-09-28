import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { checkinTecnicoSchema } from "@/lib/zod/n8n.schema";
import { emitirEvento } from "@/server/services/webhook.service";

export const dynamic = "force-dynamic";

// Equivalente por chat de iniciarAtencion.ts (check-in del técnico en sitio). Repite
// la verificación de propiedad del ticket en vez de reusar la Server Action, porque acá
// la "sesión" es una identidad resuelta por chat_id, no la de requireUsuario() — mismo
// criterio de "todo endpoint que actúa sobre un ticket asignado debe verificar
// tecnicoAsignadoId === usuario.id" que exige CLAUDE.md, aplicado a este canal también.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = checkinTecnicoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, numeroTicket } = parsed.data;
  const responder = (body: Record<string, unknown>, status: number) => NextResponse.json({ ...body, canal, identificador }, { status });

  const usuario = await prisma.usuario.findUnique({
    where: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappTelefono: identificador },
  });
  if (!usuario || usuario.rol !== "TECNICO" || usuario.estado !== "ACTIVO") {
    return responder({ ok: false, error: "USUARIO_NO_VINCULADO", mensaje: "No encontramos tu número vinculado a NexIT como técnico." }, 404);
  }

  const ticket = await prisma.ticket.findUnique({ where: { numeroTicket }, include: { cliente: true, creadoPor: true } });
  if (!ticket) {
    return responder({ ok: false, error: "TICKET_NO_ENCONTRADO", mensaje: `No existe el ticket ${numeroTicket}.` }, 404);
  }
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    return responder({ ok: false, error: "TICKET_NO_ASIGNADO", mensaje: `El ticket ${numeroTicket} no está asignado a vos.` }, 403);
  }
  if (ticket.estado !== "ASIGNADO") {
    return responder(
      { ok: false, error: "ESTADO_INVALIDO", mensaje: `El ticket ${numeroTicket} ya está en estado ${ticket.estado} — no hace falta otro check-in.` },
      409,
    );
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const ticketActualizado = await tx.ticket.update({
      where: { id: ticket.id },
      data: { estado: "EN_DIAGNOSTICO", fechaInicioAtencion: new Date() },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: ticket.id,
        usuarioId: usuario.id,
        estadoAnterior: ticket.estado,
        estadoNuevo: "EN_DIAGNOSTICO",
        comentario: `Check-in vía ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"} (asistente IA)`,
      },
    });

    return ticketActualizado;
  });

  emitirEvento({
    tipo: "TICKET_CAMBIO_ESTADO",
    ticketId: ticket.id,
    numeroTicket: actualizado.numeroTicket,
    clienteNombre: ticket.cliente.nombre,
    estadoAnterior: ticket.estado,
    estadoNuevo: "EN_DIAGNOSTICO",
    reportadoPorNombre: ticket.creadoPor.nombre,
    reportadoPorEmail: ticket.creadoPor.email,
    reportadoPorTelegramChatId: ticket.creadoPor.telegramChatId,
    reportadoPorWhatsapp: ticket.creadoPor.whatsappTelefono,
  });

  return responder({ ok: true, mensaje: `Listo, marqué el check-in del ticket ${numeroTicket}. Ya podés seguir con el diagnóstico.` }, 200);
}
