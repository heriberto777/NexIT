import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { mensajeConversacionSchema } from "@/lib/zod/n8n.schema";

export const dynamic = "force-dynamic";

// Una conversación "activa" que lleva más de este tiempo sin mensajes se da por
// abandonada — si el cliente vuelve a escribir después, arranca una conversación
// nueva en vez de resucitar contexto viejo que puede ya no aplicar.
const HORAS_ABANDONO = 6;

// Primer paso del workflow conversacional: guarda el mensaje del cliente y devuelve
// TODO el historial de la conversación activa + el contexto del cliente (sucursales y
// activos), para que el paso de IA decida con memoria real de lo ya conversado — a
// diferencia del flujo anterior (un solo turno, extraía y creaba el ticket de una),
// acá la IA puede seguir preguntando antes de decidir crear algo.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = mensajeConversacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;
  const responder = (body: Record<string, unknown>) => NextResponse.json({ ...body, canal, identificador });

  const usuario = await prisma.usuario.findUnique({
    where: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappTelefono: identificador },
    include: {
      cliente: {
        include: {
          sucursales: { include: { activos: { include: { categoria: true } } }, orderBy: { nombre: "asc" } },
        },
      },
    },
  });

  if (!usuario || usuario.rol !== "CLIENTE" || !usuario.cliente || usuario.estado !== "ACTIVO") {
    // No hay con qué cliente/sede asociarlo de forma segura — en vez de que la IA
    // intente adivinar o listarle todos los clientes al que escribe, el workflow de
    // n8n debe llamar a POST /contacto-pendiente/mensaje para recolectar los datos
    // básicos (nombre, empresa, teléfono, correo, motivo) antes de avisarle a un
    // Coordinador (ver contacto-pendiente.service.ts). `texto` viaja de vuelta en la
    // respuesta (mismo motivo que en contextoTecnicoSchema): ese próximo paso del
    // workflow ya no tiene el mensaje original disponible, porque esta misma llamada
    // pisó $json.
    return responder({ encontrado: false, texto });
  }

  const limiteAbandono = new Date(Date.now() - HORAS_ABANDONO * 60 * 60 * 1000);

  let conversacion = await prisma.conversacionChat.findFirst({
    where: { usuarioId: usuario.id, canal, identificador, estado: "ACTIVA" },
    orderBy: { actualizadaAt: "desc" },
  });

  if (conversacion && conversacion.actualizadaAt < limiteAbandono) {
    await prisma.conversacionChat.update({ where: { id: conversacion.id }, data: { estado: "RESUELTA_SIN_TICKET" } });
    conversacion = null;
  }

  if (!conversacion) {
    conversacion = await prisma.conversacionChat.create({ data: { usuarioId: usuario.id, canal, identificador } });
  }

  await prisma.$transaction([
    prisma.mensajeConversacion.create({ data: { conversacionId: conversacion.id, rol: "USUARIO", contenido: texto } }),
    prisma.conversacionChat.update({ where: { id: conversacion.id }, data: { actualizadaAt: new Date() } }),
  ]);

  const historial = await prisma.mensajeConversacion.findMany({
    where: { conversacionId: conversacion.id },
    orderBy: { createdAt: "asc" },
    select: { rol: true, contenido: true },
  });

  return responder({
    encontrado: true,
    conversacionId: conversacion.id,
    usuarioNombre: usuario.nombre,
    clienteNombre: usuario.cliente.nombre,
    sucursales: usuario.cliente.sucursales.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion,
      ciudad: s.ciudad,
      activos: s.activos.map((a) => ({ id: a.id, categoria: a.categoria.nombre, marca: a.marca, modelo: a.modelo })),
    })),
    historial,
  });
}
