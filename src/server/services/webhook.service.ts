import crypto from "node:crypto";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { registrarError } from "@/server/services/error-log.service";

export type EventoWebhook =
  | {
      tipo: "TICKET_CREADO";
      ticketId: string;
      numeroTicket: string;
      clienteId: string;
      clienteNombre: string;
      titulo: string;
      prioridad: string;
      origen: string;
      // El modelo Cliente no tiene email propio (solo Sucursal.contactoTelefono, sin
      // email) — el destinatario real es quien creó el ticket. En origen PORTAL,
      // TELEFONO y CHATBOT es siempre un contacto real del cliente (crear-ticket.ts
      // busca o crea ese Usuario antes de emitir este evento); en PROGRAMADO sigue
      // siendo el coordinador que corrió el job, no un contacto del cliente (el
      // workflow de n8n debe distinguir por `origen`).
      reportadoPorNombre: string;
      reportadoPorEmail: string;
      // null si el usuario nunca vinculó ese canal desde /perfil — el workflow de n8n
      // debe saltar el nodo de Telegram/WhatsApp cuando venga null, no intentar mandar
      // igual (un chat_id/teléfono vacío rompe esos nodos).
      reportadoPorTelegramChatId: string | null;
      reportadoPorWhatsapp: string | null;
    }
  | {
      tipo: "TICKET_CAMBIO_ESTADO";
      ticketId: string;
      numeroTicket: string;
      clienteNombre: string;
      estadoAnterior: string | null;
      estadoNuevo: string;
      reportadoPorNombre: string;
      reportadoPorEmail: string;
      reportadoPorTelegramChatId: string | null;
      reportadoPorWhatsapp: string | null;
      // Solo tiene contenido cuando estadoNuevo="CANCELADO" (el motivo que cargó
      // Coordinador/Admin al cancelar) — el resto de las transiciones no lo usan.
      motivo?: string;
    }
  | {
      tipo: "SLA_EN_RIESGO";
      ticketId: string;
      numeroTicket: string;
      clienteNombre: string;
      titulo: string;
      prioridad: string;
      tecnicoAsignadoNombre: string | null;
      estadoSla: "en_riesgo" | "vencido";
      minutosRestantes: number;
    }
  | {
      tipo: "TICKET_ASIGNADO";
      ticketId: string;
      numeroTicket: string;
      clienteNombre: string;
      titulo: string;
      prioridad: string;
      esReasignacion: boolean;
      // Igual que en TICKET_CREADO: cuando origen="PROGRAMADO" el "reportador" es el
      // coordinador que corrió la generación automática, no un contacto real del
      // cliente — el workflow de n8n debe filtrar por `origen` antes de notificarle al
      // reportador (el coordinador ya sabe que generó el ticket, no hace falta avisarle
      // que "le asignaron un técnico a su ticket").
      origen: string;
      // Dos destinatarios distintos en el mismo evento: el TÉCNICO recién asignado
      // (que tiene trabajo nuevo) Y el cliente que reportó el ticket (a quien antes no
      // le llegaba ningún aviso de que alguien ya estaba viendo su problema — ni
      // siquiera por email). El workflow de n8n arma un mensaje para cada uno.
      tecnicoNombre: string;
      tecnicoEmail: string;
      tecnicoTelegramChatId: string | null;
      tecnicoWhatsapp: string | null;
      reportadoPorNombre: string;
      reportadoPorEmail: string;
      reportadoPorTelegramChatId: string | null;
      reportadoPorWhatsapp: string | null;
    }
  | {
      // Se emite cuando el staff crea un ticket interno para un contacto que todavía
      // no existía en NexIT (ver crear-ticket.ts) — el contacto recién creado no tiene
      // forma de enterarse de su acceso al Portal si nadie se lo avisa.
      tipo: "CONTACTO_CREADO";
      usuarioId: string;
      nombre: string;
      email: string;
      passwordTemporal: string;
      clienteNombre: string;
      whatsapp: string | null;
    }
  | {
      // Mensaje de Telegram/WhatsApp de un chat_id/teléfono que no está vinculado a
      // ningún Usuario — no hay a quién notificarle un "ticket creado", así que esto va
      // a un chat interno de soporte para que un Coordinador contacte a la persona y
      // levante el ticket manualmente (ver /api/n8n/conversacion/mensaje).
      tipo: "CONTACTO_NO_IDENTIFICADO";
      canal: string;
      identificador: string;
      texto: string;
    };

const TIMEOUT_MS = 8000;

// Dispara el webhook en segundo plano (fire-and-forget): el llamador NUNCA hace
// `await` de esto, así que un n8n lento o caído jamás degrada el tiempo de respuesta
// de la Server Action que originó el evento. Los errores solo se registran.
export function emitirEvento(evento: EventoWebhook): void {
  void enviarWebhook(evento).catch((error) => {
    const ticketId = "ticketId" in evento ? evento.ticketId : undefined;
    registrarError("webhook", error, { evento: evento.tipo, ticketId });
  });
}

function construirHeaders(body: string, secret: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    // Ambos mecanismos a la vez: HMAC para que n8n verifique integridad del payload,
    // Bearer para el caso simple de un Webhook node protegido solo por header estático.
    headers["X-NexIT-Signature"] = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return headers;
}

async function postConTimeout(url: string, body: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method: "POST", headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enviarWebhook(evento: EventoWebhook): Promise<void> {
  // obtenerConfiguracion() ya resuelve BD -> .env -> defaults fijos, en ese orden — no
  // hay que repetir esa cadena de fallback aquí.
  const config = await obtenerConfiguracion();
  if (!config.webhooksHabilitados || !config.webhookUrl) return;

  const { tipo, ...data } = evento;
  const body = JSON.stringify({ evento: tipo, timestamp: new Date().toISOString(), data });
  const headers = construirHeaders(body, config.webhookSecret);

  const res = await postConTimeout(config.webhookUrl, body, headers);
  if (!res.ok) {
    registrarError("webhook", new Error(`${tipo} respondió ${res.status} ${res.statusText}`), { evento: tipo });
  }
}

export interface ResultadoPruebaWebhook {
  ok: boolean;
  status?: number;
  mensaje: string;
}

// A diferencia de emitirEvento() (fire-and-forget), esta SÍ espera la respuesta —
// la usa el botón "Probar Webhook" de /admin/configuracion, que necesita reportarle
// éxito/error al administrador en el momento.
export async function probarWebhook(): Promise<ResultadoPruebaWebhook> {
  const config = await obtenerConfiguracion();
  if (!config.webhookUrl) {
    return { ok: false, mensaje: "No hay una URL de webhook configurada." };
  }

  const body = JSON.stringify({
    evento: "PRUEBA_CONEXION",
    timestamp: new Date().toISOString(),
    data: { mensaje: "Ping de prueba desde /admin/configuracion en NexIT." },
  });
  const headers = construirHeaders(body, config.webhookSecret);

  try {
    const res = await postConTimeout(config.webhookUrl, body, headers);
    return res.ok
      ? { ok: true, status: res.status, mensaje: `El endpoint respondió ${res.status}.` }
      : { ok: false, status: res.status, mensaje: `El endpoint respondió ${res.status} ${res.statusText}.` };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, mensaje: `No se pudo conectar: ${detalle}` };
  }
}
