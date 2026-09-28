import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { turnoConversacionSchema } from "@/lib/zod/n8n.schema";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";

export const dynamic = "force-dynamic";

const PRIORIDAD_LABEL: Record<string, string> = { CRITICA: "crítica", ALTA: "alta", MEDIA: "media", BAJA: "baja" };

// Segundo paso del workflow conversacional: persiste la respuesta de la IA en el
// historial y, solo cuando accion=CREAR_TICKET, recién ahí crea el ticket (misma
// lógica que el viejo /api/n8n/crear-ticket-chat, ahora disparada por una decisión de
// la IA en vez de automáticamente en cada mensaje).
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = turnoConversacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { conversacionId, accion, mensajeAsistente, ticket: datosTicket } = parsed.data;

  const conversacion = await prisma.conversacionChat.findUnique({
    where: { id: conversacionId },
    include: { usuario: { include: { cliente: true } } },
  });
  if (!conversacion) {
    return NextResponse.json({ ok: false, error: "CONVERSACION_NO_ENCONTRADA", mensaje: "No encontré esta conversación." }, { status: 404 });
  }
  const { canal, identificador, usuario } = conversacion;
  const responder = (body: Record<string, unknown>, status: number) => NextResponse.json({ ...body, canal, identificador }, { status });

  await prisma.mensajeConversacion.create({ data: { conversacionId, rol: "ASISTENTE", contenido: mensajeAsistente } });

  if (accion === "CERRAR_SIN_TICKET") {
    await prisma.conversacionChat.update({ where: { id: conversacionId }, data: { estado: "RESUELTA_SIN_TICKET" } });
    return responder({ ok: true, mensaje: mensajeAsistente }, 200);
  }

  if (accion === "PREGUNTAR" || accion === "SUGERIR_SOLUCION") {
    await prisma.conversacionChat.update({ where: { id: conversacionId }, data: { actualizadaAt: new Date() } });
    return responder({ ok: true, mensaje: mensajeAsistente }, 200);
  }

  // accion === "CREAR_TICKET" — el schema ya garantizó que `datosTicket` viene completo.
  if (!usuario.clienteId || !usuario.cliente) {
    return responder({ ok: false, error: "USUARIO_SIN_CLIENTE", mensaje: "Tu usuario no está asociado a ninguna empresa." }, 409);
  }
  const { titulo, descripcion, tipo, categoriaSoporte, prioridad, sucursalId, activoId } = datosTicket!;

  const sucursales = await prisma.sucursal.findMany({ where: { clienteId: usuario.clienteId }, orderBy: { nombre: "asc" } });
  let sucursalResuelta = sucursalId ? sucursales.find((s) => s.id === sucursalId) : undefined;
  if (sucursalId && !sucursalResuelta) {
    return responder({ ok: false, error: "SUCURSAL_INVALIDA", mensaje: "Esa sucursal no pertenece a tu empresa." }, 422);
  }
  if (!sucursalResuelta) {
    if (sucursales.length === 1) {
      sucursalResuelta = sucursales[0];
    } else {
      return responder(
        {
          ok: false,
          error: "SUCURSAL_AMBIGUA",
          mensaje: "¿De cuál de tus sedes es el problema?",
          opciones: sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
        },
        422,
      );
    }
  }

  if (activoId) {
    const activo = await prisma.activo.findUnique({ where: { id: activoId } });
    if (!activo || activo.sucursalId !== sucursalResuelta.id) {
      return responder({ ok: false, error: "ACTIVO_INVALIDO", mensaje: "Ese equipo no pertenece a la sede indicada." }, 422);
    }
  }

  const contrato = await prisma.contrato.findFirst({
    where: { clienteId: usuario.clienteId, estado: "ACTIVO" },
    orderBy: { fechaInicio: "desc" },
  });
  const sla = contrato ? await prisma.contratoSla.findFirst({ where: { contratoId: contrato.id, prioridad } }) : null;

  const numeroTicket = await siguienteNumeroTicket();

  const ticket = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.ticket.create({
      data: {
        numeroTicket,
        clienteId: usuario.clienteId!,
        sucursalId: sucursalResuelta!.id,
        activoId,
        tipo,
        categoriaSoporte,
        prioridad,
        estado: "ABIERTO",
        titulo,
        descripcion: `[Reportado por ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"} — vía asistente IA conversacional]\n\n${descripcion}`,
        creadoPorId: usuario.id,
        slaId: sla?.id,
        origen: "CHATBOT",
      },
      include: { cliente: true },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: nuevo.id,
        usuarioId: usuario.id,
        estadoNuevo: "ABIERTO",
        comentario: `Ticket creado por ${usuario.nombre} vía ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"} (asistente IA, tras conversación)`,
      },
    });

    await tx.conversacionChat.update({ where: { id: conversacionId }, data: { estado: "CONVERTIDA_A_TICKET", ticketId: nuevo.id } });

    return nuevo;
  });

  emitirEvento({
    tipo: "TICKET_CREADO",
    ticketId: ticket.id,
    numeroTicket: ticket.numeroTicket,
    clienteId: ticket.clienteId,
    clienteNombre: ticket.cliente.nombre,
    titulo: ticket.titulo,
    prioridad: ticket.prioridad,
    origen: "CHATBOT",
    reportadoPorNombre: usuario.nombre,
    reportadoPorEmail: usuario.email,
    reportadoPorTelegramChatId: usuario.telegramChatId,
    reportadoPorWhatsapp: usuario.whatsappTelefono,
  });

  return responder(
    {
      ok: true,
      ticketId: ticket.id,
      numeroTicket: ticket.numeroTicket,
      mensaje: `${mensajeAsistente}\n\n✅ Ticket #${ticket.numeroTicket} creado (prioridad ${PRIORIDAD_LABEL[prioridad]}). Te avisaremos cuando un técnico lo atienda.`,
    },
    200,
  );
}
