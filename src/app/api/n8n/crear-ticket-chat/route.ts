import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { crearTicketChatSchema } from "@/lib/zod/n8n.schema";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";

export const dynamic = "force-dynamic";

const PRIORIDAD_LABEL: Record<string, string> = { CRITICA: "crítica", ALTA: "alta", MEDIA: "media", BAJA: "baja" };

// Paso final del workflow de IA: n8n ya resolvió `identificador` -> cliente (vía
// /api/n8n/contexto-cliente) y extrajo título/descripción/sucursal del mensaje libre.
// Devuelve un `mensaje` en texto plano listo para reenviar tal cual al chat — así n8n
// no necesita su propia lógica de "cómo redactar la confirmación".
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = crearTicketChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, titulo, descripcion, tipo, categoriaSoporte, prioridad, sucursalId, activoId } = parsed.data;

  // canal/identificador viajan en TODAS las respuestas de este endpoint (éxito o
  // error) — mismo motivo que en /api/n8n/contexto-cliente: un HTTP Request node de
  // n8n reemplaza $json con este body, así que sin esto el paso final del workflow
  // (responder por el canal correcto) no tendría a quién contestarle.
  const responder = (body: Record<string, unknown>, status: number) =>
    NextResponse.json({ ...body, canal, identificador }, { status });

  const usuario = await prisma.usuario.findUnique({
    where: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappTelefono: identificador },
  });
  if (!usuario || usuario.rol !== "CLIENTE" || !usuario.clienteId || usuario.estado !== "ACTIVO") {
    return responder(
      { ok: false, error: "USUARIO_NO_VINCULADO", mensaje: "No encontramos tu número vinculado a NexIT. Pedile a soporte que lo configure en tu perfil." },
      404,
    );
  }

  const sucursales = await prisma.sucursal.findMany({ where: { clienteId: usuario.clienteId }, orderBy: { nombre: "asc" } });
  let sucursalResuelta = sucursalId ? sucursales.find((s) => s.id === sucursalId) : undefined;
  if (sucursalId && !sucursalResuelta) {
    return responder({ ok: false, error: "SUCURSAL_INVALIDA", mensaje: "Esa sucursal no pertenece a tu empresa." }, 422);
  }
  if (!sucursalResuelta) {
    if (sucursales.length === 1) {
      sucursalResuelta = sucursales[0];
    } else {
      // Ambiguo: se lo devolvemos a n8n como una lista de opciones en vez de un error
      // genérico, para que el paso de IA le pregunte al usuario cuál sede es y reintente.
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
        descripcion: `[Reportado por ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"} — vía asistente IA]\n\n${descripcion}`,
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
        comentario: `Ticket creado por ${usuario.nombre} vía ${canal === "TELEGRAM" ? "Telegram" : "WhatsApp"} (asistente IA)`,
      },
    });

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
      mensaje: `Listo, creé el ticket #${ticket.numeroTicket} con prioridad ${PRIORIDAD_LABEL[prioridad]}. Te avisaremos cuando un técnico lo atienda.`,
    },
    200,
  );
}
