import { NextResponse } from "next/server";
import type { EstadoTicket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { contextoTecnicoSchema } from "@/lib/zod/n8n.schema";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

const ESTADOS_TERMINALES: EstadoTicket[] = ["RESUELTO", "CERRADO", "CANCELADO"];

// Primer paso del workflow de técnico por chat: resuelve el chat_id/teléfono a un
// Usuario con rol TECNICO y le devuelve sus tickets activos (no terminales) — el
// paso de IA usa esta lista para matchear "hice check-in del 5" o una foto sin
// número explícito al ticket correcto.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const { searchParams } = new URL(request.url);
  const parsed = contextoTecnicoSchema.safeParse({
    canal: searchParams.get("canal"),
    identificador: searchParams.get("identificador"),
    texto: searchParams.get("texto") ?? undefined,
    tieneFoto: searchParams.get("tieneFoto") ?? undefined,
    fileId: searchParams.get("fileId") ?? undefined,
    mediaUrl: searchParams.get("mediaUrl") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto, tieneFoto, fileId, mediaUrl } = parsed.data;

  const responder = (body: Record<string, unknown>) =>
    NextResponse.json({ ...body, canal, identificador, texto, tieneFoto, fileId, mediaUrl });

  // Para WhatsApp, también prueba whatsappIdentificadorAlterno (cuentas con la
  // privacidad de "nombre de usuario" de Meta activada — ver
  // vinculacion-identidad.service.ts).
  const usuario = await resolverUsuarioPorChatId(canal, identificador);

  if (usuario && usuario.rol !== "TECNICO") {
    // Encontramos a alguien, pero con otro rol — no es un caso de "no identificado"
    // (reintentar la vinculación nunca va a cambiarle el rol a esta persona). El
    // workflow de n8n debe cortar acá con este mensaje en vez de volver a llamar a
    // POST /vinculacion-identidad/mensaje: ese loop (vincula → sigue fallando el rol →
    // sin registro de intento previo, vuelve a pedir el correo desde cero) fue un bug
    // real reportado con un Admin probando este flujo.
    const { empresaNombre } = await obtenerConfiguracion();
    return responder({
      autorizado: false,
      motivo: "ROL_INCORRECTO",
      mensaje: `Tu cuenta en ${empresaNombre} es de ${usuario.rol.toLowerCase()}, no de técnico — este canal es solo para seguimiento de tickets asignados a técnicos. Si necesitás otra cosa, escribí al canal correspondiente a tu rol.`,
    });
  }

  if (!usuario || usuario.estado !== "ACTIVO") {
    const { empresaNombre } = await obtenerConfiguracion();
    return responder({
      autorizado: false,
      motivo: "NO_ENCONTRADO",
      mensaje: `No encontramos tu número vinculado a ${empresaNombre} como técnico. Pedile al administrador que lo configure en tu perfil.`,
    });
  }

  const tickets = await prisma.ticket.findMany({
    where: { tecnicoAsignadoId: usuario.id, estado: { notIn: ESTADOS_TERMINALES } },
    include: { cliente: true, sucursal: true },
    orderBy: { fechaCreacion: "asc" },
  });

  return responder({
    autorizado: true,
    usuarioNombre: usuario.nombre,
    tickets: tickets.map((t) => ({
      numeroTicket: t.numeroTicket,
      titulo: t.titulo,
      clienteNombre: t.cliente.nombre,
      sucursalNombre: t.sucursal.nombre,
      estado: t.estado,
      prioridad: t.prioridad,
    })),
  });
}
