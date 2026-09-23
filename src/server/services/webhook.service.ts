import crypto from "node:crypto";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

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
      // email) — el destinatario real es quien creó el ticket. En origen PORTAL es el
      // cliente que reportó la falla; en PROGRAMADO es el coordinador que corrió el
      // job, no un contacto del cliente (el workflow de n8n debe distinguir por `origen`).
      reportadoPorNombre: string;
      reportadoPorEmail: string;
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
    };

const TIMEOUT_MS = 8000;

// Dispara el webhook en segundo plano (fire-and-forget): el llamador NUNCA hace
// `await` de esto, así que un n8n lento o caído jamás degrada el tiempo de respuesta
// de la Server Action que originó el evento. Los errores solo se registran.
export function emitirEvento(evento: EventoWebhook): void {
  void enviarWebhook(evento).catch((error) => {
    console.error(`[webhook] Error enviando evento ${evento.tipo} (ticket ${evento.ticketId}):`, error);
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
    console.error(`[webhook] ${tipo} respondió ${res.status} ${res.statusText}`);
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
