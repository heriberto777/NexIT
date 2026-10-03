import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { mensajeConversacionSchema } from "@/lib/zod/n8n.schema";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

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

  // Prueba whatsappTelefono/telegramChatId y, para WhatsApp, también
  // whatsappIdentificadorAlterno (cuentas con la privacidad de "nombre de usuario" de
  // Meta activada — ver vinculacion-identidad.service.ts). Segunda consulta con
  // `include` solo si la primera encontró algo, para no pedir ese árbol completo en el
  // caso — más frecuente — de no encontrar nada.
  const usuarioBase = await resolverUsuarioPorChatId(canal, identificador);
  const usuario = usuarioBase
    ? await prisma.usuario.findUnique({
        where: { id: usuarioBase.id },
        include: {
          cliente: {
            include: {
              sucursales: { include: { activos: { include: { categoria: true } } }, orderBy: { nombre: "asc" } },
              sistemasSoftware: { where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } },
            },
          },
        },
      })
    : null;

  if (usuarioBase && usuarioBase.rol !== "CLIENTE") {
    // Encontramos a alguien, pero este canal es para clientes — no es un caso de "no
    // identificado" (nunca va a resolverse reintentando la vinculación: el rol no va a
    // cambiar por reescribir el correo). El workflow de n8n debe cortar acá con este
    // mensaje en vez de volver a llamar a POST /vinculacion-identidad/mensaje, que
    // re-vincularía el mismo canal sin que el chequeo de rol de abajo vaya a pasar
    // nunca — eso era justo el loop infinito reportado (vincula, falla el rol, se
    // repite desde cero en cada mensaje porque no queda ningún registro de que ya se
    // intentó).
    const { empresaNombre } = await obtenerConfiguracion();
    return responder({
      encontrado: false,
      motivo: "ROL_INCORRECTO",
      mensaje: `Tu cuenta en ${empresaNombre} es de ${usuarioBase.rol.toLowerCase()}, no de cliente — este canal es para reportar o seguir problemas como cliente. Si necesitás otra cosa, escribí al canal correspondiente a tu rol.`,
      texto,
    });
  }

  if (!usuario || !usuario.cliente || usuario.estado !== "ACTIVO") {
    // No hay con qué cliente/sede asociarlo de forma segura — en vez de que la IA
    // intente adivinar o listarle todos los clientes al que escribe, el workflow de
    // n8n debe llamar a POST /vinculacion-identidad/mensaje primero (le pide su correo
    // y, si corresponde, lo vincula con un código) y, si eso tampoco resuelve a nadie,
    // recién ahí a POST /contacto-pendiente/mensaje para recolectar los datos básicos
    // (nombre, empresa, teléfono, correo, motivo) antes de avisarle a un Coordinador
    // (ver contacto-pendiente.service.ts). `texto` viaja de vuelta en la respuesta
    // (mismo motivo que en contextoTecnicoSchema): ese próximo paso del workflow ya no
    // tiene el mensaje original disponible, porque esta misma llamada pisó $json.
    return responder({ encontrado: false, motivo: "NO_ENCONTRADO", texto });
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

  const { empresaNombre } = await obtenerConfiguracion();

  return responder({
    encontrado: true,
    empresaNombre,
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
    // Sistemas/software que el cliente tiene registrado (ver /admin/sistemas-software)
    // — le da a la IA la misma distinción Equipo/Sistema que ya existe en el wizard web:
    // un activoId es un equipo físico, un sistemaSoftwareId es un sistema de terceros.
    sistemasSoftware: usuario.cliente.sistemasSoftware.map((s) => ({ id: s.id, nombre: s.nombre })),
    historial,
  });
}
