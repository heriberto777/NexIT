import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { contextoClienteSchema } from "@/lib/zod/n8n.schema";

export const dynamic = "force-dynamic";

// Lo llama el paso de IA del workflow de n8n (Telegram/WhatsApp Trigger → este
// endpoint → nodo de IA) ANTES de intentar crear el ticket: le da al modelo el
// nombre del cliente, sus sucursales y sus activos, para que pueda (a) resolver
// referencias ambiguas del mensaje ("el aire acondicionado del piso 2" -> un activoId
// real) y (b) saber si hace falta preguntarle algo al usuario antes de crear el ticket
// (ej. más de una sucursal y el mensaje no aclaró cuál).
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const { searchParams } = new URL(request.url);
  const parsed = contextoClienteSchema.safeParse({
    canal: searchParams.get("canal"),
    identificador: searchParams.get("identificador"),
    texto: searchParams.get("texto") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;

  // canal/identificador/texto viajan en TODAS las respuestas (encontrado o no) — un
  // nodo HTTP Request de n8n reemplaza $json con este body, así que es la única forma
  // confiable de que los pasos siguientes (IA, respuesta por el canal correcto)
  // conserven estos datos sin referenciar por nombre un nodo Trigger anterior (frágil:
  // falla si ese nodo no corrió en la ejecución actual, como pasa entre Telegram y
  // WhatsApp, que son mutuamente excluyentes).
  const responder = (body: Record<string, unknown>) => NextResponse.json({ ...body, canal, identificador, texto });

  const usuario = await prisma.usuario.findUnique({
    where: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappTelefono: identificador },
    include: {
      cliente: {
        include: {
          sucursales: {
            include: { activos: { include: { categoria: true } } },
            orderBy: { nombre: "asc" },
          },
        },
      },
    },
  });

  if (!usuario || usuario.rol !== "CLIENTE" || !usuario.cliente) {
    return responder({
      encontrado: false,
      mensaje: "No encontramos tu número vinculado a NexIT. Pedile a soporte que lo configure en tu perfil.",
    });
  }
  if (usuario.estado !== "ACTIVO") {
    return responder({ encontrado: false, motivo: "USUARIO_INACTIVO", mensaje: "Tu usuario está inactivo en NexIT. Contacta a soporte." });
  }

  return responder({
    encontrado: true,
    usuarioNombre: usuario.nombre,
    clienteId: usuario.cliente.id,
    clienteNombre: usuario.cliente.nombre,
    sucursales: usuario.cliente.sucursales.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion,
      ciudad: s.ciudad,
      activos: s.activos.map((a) => ({ id: a.id, categoria: a.categoria.nombre, marca: a.marca, modelo: a.modelo })),
    })),
  });
}
