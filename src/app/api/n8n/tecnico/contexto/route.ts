import { NextResponse } from "next/server";
import type { EstadoTicket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { contextoTecnicoSchema } from "@/lib/zod/n8n.schema";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";

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

  if (!usuario || usuario.rol !== "TECNICO" || usuario.estado !== "ACTIVO") {
    return responder({
      autorizado: false,
      mensaje: "No encontramos tu número vinculado a NexIT como técnico. Pedile al administrador que lo configure en tu perfil.",
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
