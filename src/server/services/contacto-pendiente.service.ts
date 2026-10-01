import { prisma } from "@/lib/prisma";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarContactoPendienteNuevo } from "@/server/services/notificacion.service";
import type { Prisma, ContactoPendiente } from "@prisma/client";

const CAMPOS_ORDEN = ["nombre", "empresaReportada", "telefonoReportado", "correoReportado", "motivo"] as const;
type Campo = (typeof CAMPOS_ORDEN)[number];

const PREGUNTAS: Record<Campo, string> = {
  nombre: "¿Cuál es tu nombre?",
  empresaReportada: "¿De qué empresa nos escribís?",
  telefonoReportado: "¿A qué número de teléfono te podemos contactar?",
  correoReportado: "¿Cuál es tu correo electrónico?",
  motivo: "Por último, contanos brevemente qué necesitás.",
};

// Validación mínima por campo — si no pasa, se vuelve a preguntar lo mismo con una
// pista, sin avanzar ni guardar el valor inválido.
const VALIDADORES: Partial<Record<Campo, (valor: string) => boolean>> = {
  telefonoReportado: (v) => v.replace(/\D/g, "").length >= 7,
  correoReportado: (v) => /\S+@\S+\.\S+/.test(v),
};

const REINTENTOS: Partial<Record<Campo, string>> = {
  telefonoReportado: "Ese número no parece completo — escribilo de nuevo, por favor (con código de área).",
  correoReportado: "Ese correo no parece válido — escribilo de nuevo, por favor.",
};

function primerCampoVacio(contacto: ContactoPendiente): Campo | null {
  return CAMPOS_ORDEN.find((c) => !contacto[c]) ?? null;
}

function datosParaCampo(campo: Campo, valor: string): Prisma.ContactoPendienteUpdateInput {
  switch (campo) {
    case "nombre":
      return { nombre: valor };
    case "empresaReportada":
      return { empresaReportada: valor };
    case "telefonoReportado":
      return { telefonoReportado: valor };
    case "correoReportado":
      return { correoReportado: valor };
    case "motivo":
      return { motivo: valor };
  }
}

// Reemplaza el viejo "no encontramos tu número, listo" de un solo mensaje: ahora junta
// 5 datos básicos (uno por turno, sin IA — el orden es fijo, así que el primer campo
// vacío siempre es "lo que se acaba de preguntar") antes de avisarle a un
// Coordinador/Admin. El primer mensaje de una persona nueva NUNCA se interpreta como
// respuesta a nada — solo dispara la primera pregunta.
export async function procesarMensajeContactoPendiente(input: { canal: string; identificador: string; texto: string }): Promise<{ mensaje: string }> {
  const { canal, identificador, texto } = input;

  const existente = await prisma.contactoPendiente.findFirst({
    where: { canal, identificador },
    orderBy: { fechaCreacion: "desc" },
    include: { ticket: { select: { numeroTicket: true } } },
  });

  if (!existente) {
    await prisma.contactoPendiente.create({ data: { canal, identificador } });
    return { mensaje: `No encontramos tu número vinculado a NexIT. Para que un representante te pueda contactar, necesitamos algunos datos.\n\n${PREGUNTAS.nombre}` };
  }

  if (existente.estado === "PENDIENTE") {
    return { mensaje: "Ya registramos tus datos — en breve un representante te contactará. Gracias por tu paciencia." };
  }

  if (existente.estado === "CONVERTIDO") {
    return {
      mensaje: existente.ticket
        ? `Ya tenés un ticket en curso (#${existente.ticket.numeroTicket}). Un técnico se va a poner en contacto.`
        : "Ya estamos trabajando en tu solicitud.",
    };
  }

  // RECOLECTANDO — texto es la respuesta al primer campo vacío (el que se preguntó la vez pasada).
  const campoActual = primerCampoVacio(existente);
  if (!campoActual) {
    return { mensaje: "Ya registramos tus datos — en breve un representante te contactará." };
  }

  const valor = texto.trim();
  const validador = VALIDADORES[campoActual];
  if (validador && !validador(valor)) {
    return { mensaje: REINTENTOS[campoActual]! };
  }

  const actualizado = await prisma.contactoPendiente.update({
    where: { id: existente.id },
    data: datosParaCampo(campoActual, valor),
  });

  const siguienteCampo = primerCampoVacio(actualizado);
  if (siguienteCampo) {
    return { mensaje: PREGUNTAS[siguienteCampo] };
  }

  // Los 5 campos ya están completos — recién acá se avisa, para no llenar el chat
  // interno de soporte con cada "Hola" suelto antes de tener algo accionable.
  await prisma.contactoPendiente.update({ where: { id: actualizado.id }, data: { estado: "PENDIENTE" } });

  const staff = await prisma.usuario.findMany({
    where: { rol: { in: ["ADMIN", "COORDINADOR"] }, estado: "ACTIVO", whatsappTelefono: { not: null } },
    select: { whatsappTelefono: true },
  });

  emitirEvento({
    tipo: "CONTACTO_NO_IDENTIFICADO",
    contactoPendienteId: actualizado.id,
    canal,
    identificador,
    nombre: actualizado.nombre!,
    empresaReportada: actualizado.empresaReportada!,
    telefonoReportado: actualizado.telefonoReportado!,
    correoReportado: actualizado.correoReportado!,
    motivo: actualizado.motivo!,
    staffWhatsapp: staff.map((s) => s.whatsappTelefono!).filter(Boolean),
  });

  await notificarContactoPendienteNuevo(actualizado);

  return { mensaje: "¡Gracias! Ya registramos tus datos. En breve un representante de nuestro equipo te va a contactar." };
}
