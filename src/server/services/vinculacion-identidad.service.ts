import { prisma } from "@/lib/prisma";
import { enviarCodigoVinculacionChat } from "@/server/services/email.service";

const MINUTOS_VIGENCIA = 10;
const INTENTOS_MAXIMOS = 3;

function generarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function vencio(expiraEn: Date): boolean {
  return expiraEn.getTime() < Date.now();
}

// Guarda el identificador de ESE canal en el campo correspondiente del Usuario ya
// verificado — Telegram no tiene variante "opaca" (su chat id siempre es estable), así
// que solo WhatsApp usa el campo alterno (ver comentario en schema.prisma).
async function vincularIdentificador(usuarioId: string, canal: string, identificador: string): Promise<void> {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: canal === "TELEGRAM" ? { telegramChatId: identificador } : { whatsappIdentificadorAlterno: identificador },
  });
}

// Resuelve "quién escribió esto" probando, en orden, los tres identificadores posibles
// — el tercero (whatsappIdentificadorAlterno) solo existe para cuentas de WhatsApp con
// la privacidad de "nombre de usuario" de Meta activada (ver conversación de diseño).
export async function resolverUsuarioPorChatId(canal: string, identificador: string) {
  if (canal === "TELEGRAM") {
    return prisma.usuario.findUnique({ where: { telegramChatId: identificador } });
  }
  const porTelefono = await prisma.usuario.findUnique({ where: { whatsappTelefono: identificador } });
  if (porTelefono) return porTelefono;
  return prisma.usuario.findUnique({ where: { whatsappIdentificadorAlterno: identificador } });
}

// Se llama SOLO cuando resolverUsuarioPorChatId ya falló. `continuar: true` le indica a
// quien llama (la ruta HTTP) que debe seguir con el flujo de "Contacto pendiente" de
// siempre — este servicio no sabe nada de ese flujo, solo avisa cuándo le toca.
export async function procesarMensajeVinculacion(input: {
  canal: string;
  identificador: string;
  texto: string;
}): Promise<{ continuar: boolean; mensaje: string }> {
  const { canal, identificador, texto } = input;

  // Si ya hay una conversación de "Contacto pendiente" en curso (todavía respondiendo
  // preguntas, o ya las completó y espera que un representante lo contacte), no hay que
  // interrumpirla con la pregunta de vinculación — n8n llama a este endpoint en CADA
  // mensaje mientras conversacion/mensaje siga devolviendo "no encontrado", así que sin
  // este corte cada respuesta real de Contacto pendiente quedaba "comida" por la
  // pregunta del correo (bug real: nombre/empresa terminaban guardados como el correo).
  const contactoEnCurso = await prisma.contactoPendiente.findFirst({
    where: { canal, identificador, estado: { in: ["RECOLECTANDO", "PENDIENTE"] } },
  });
  if (contactoEnCurso) {
    await prisma.verificacionIdentidadChat.deleteMany({ where: { canal, identificador } });
    return { continuar: true, mensaje: "" };
  }

  const existente = await prisma.verificacionIdentidadChat.findFirst({
    where: { canal, identificador },
    orderBy: { expiraEn: "desc" },
  });

  // Sin intento en curso (o el anterior venció): este mensaje dispara la pregunta, no
  // se interpreta como respuesta a nada — mismo criterio que ContactoPendiente.
  if (!existente || vencio(existente.expiraEn)) {
    if (existente) await prisma.verificacionIdentidadChat.delete({ where: { id: existente.id } });
    await prisma.verificacionIdentidadChat.create({
      data: { canal, identificador, expiraEn: new Date(Date.now() + MINUTOS_VIGENCIA * 60 * 1000) },
    });
    return {
      continuar: false,
      mensaje: "Antes de continuar, decime el correo con el que tenés cuenta en NexIT (si no tenés, no te preocupes, seguimos igual).",
    };
  }

  // Esperando correo (usuarioId todavía null) — este mensaje ES la respuesta.
  if (!existente.usuarioId) {
    const correo = texto.trim().toLowerCase();
    const usuario = /\S+@\S+\.\S+/.test(correo) ? await prisma.usuario.findUnique({ where: { email: correo } }) : null;

    if (!usuario || usuario.estado !== "ACTIVO") {
      // No es nadie conocido — un solo intento, sin loop: se delega de inmediato al
      // flujo de "Contacto pendiente" en vez de insistir con el correo.
      await prisma.verificacionIdentidadChat.delete({ where: { id: existente.id } });
      return { continuar: true, mensaje: "" };
    }

    const codigo = generarCodigo();
    try {
      await enviarCodigoVinculacionChat(usuario, codigo);
    } catch {
      await prisma.verificacionIdentidadChat.delete({ where: { id: existente.id } });
      return { continuar: false, mensaje: "No pudimos enviarte el código por correo en este momento. Probá de nuevo más tarde." };
    }

    await prisma.verificacionIdentidadChat.update({
      where: { id: existente.id },
      data: { usuarioId: usuario.id, codigo, intentos: 0, expiraEn: new Date(Date.now() + MINUTOS_VIGENCIA * 60 * 1000) },
    });
    return { continuar: false, mensaje: `Te mandamos un código de 6 dígitos a tu correo. Escribilo acá para confirmar que sos vos.` };
  }

  // Esperando código.
  const codigoIngresado = texto.trim();
  if (codigoIngresado !== existente.codigo) {
    const intentos = existente.intentos + 1;
    if (intentos >= INTENTOS_MAXIMOS) {
      await prisma.verificacionIdentidadChat.delete({ where: { id: existente.id } });
      return { continuar: false, mensaje: "Demasiados intentos fallidos — escribime de nuevo tu correo para reintentar." };
    }
    await prisma.verificacionIdentidadChat.update({ where: { id: existente.id }, data: { intentos } });
    return { continuar: false, mensaje: "Ese código no coincide — probá de nuevo." };
  }

  await vincularIdentificador(existente.usuarioId, canal, identificador);
  await prisma.verificacionIdentidadChat.delete({ where: { id: existente.id } });
  return { continuar: false, mensaje: "¡Listo! Ya vinculamos tu cuenta. Contame qué necesitás." };
}
