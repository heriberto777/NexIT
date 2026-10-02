import crypto from "node:crypto";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { registrarError } from "@/server/services/error-log.service";
import { renderizarPlantilla } from "@/server/services/plantilla-notificacion.service";

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
      // Se emite recién cuando el asistente de chat terminó de recolectar los 5 datos
      // básicos de un contacto no identificado (ver contacto-pendiente.service.ts) — no
      // en el primer mensaje, para no spamear al chat interno con cada "Hola" suelto
      // antes de tener algo accionable. Un Coordinador/Admin decide manualmente a qué
      // cliente real pertenece desde /admin/contactos-pendientes — `empresaReportada`
      // es solo lo que la persona escribió, nunca se usa para matchear un Cliente real.
      tipo: "CONTACTO_NO_IDENTIFICADO";
      contactoPendienteId: string;
      canal: string;
      identificador: string;
      nombre: string;
      empresaReportada: string;
      telefonoReportado: string;
      correoReportado: string;
      motivo: string;
      // Teléfonos de WhatsApp de ADMIN/COORDINADOR activos que vincularon el canal —
      // NexIT ya resuelve la lista porque n8n no tiene forma de consultar la base de
      // datos. El workflow de n8n itera este arreglo (puede venir vacío) para avisarle
      // a cada uno, además del aviso al chat interno de Telegram.
      staffWhatsapp: string[];
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

// Arma el/los mensaje(s) ya renderizados de ESTE evento (placeholder de la plantilla
// personalizada, o el texto por defecto si nadie la tocó) — viajan en `data.mensaje`
// (o `data.mensajeTecnico`/`data.mensajeCliente` cuando el evento tiene dos
// destinatarios con texto distinto) para que el workflow de n8n solo tenga que
// relayarlos (`{{$json.data.mensaje}}`), no tener su propia copia del texto. Ningún
// workflow existente los usa todavía — ver conversación de diseño sobre
// PlantillaNotificacion — así que esto no cambia nada hasta que se actualicen a mano.
async function renderizarMensajesEvento(evento: EventoWebhook): Promise<Record<string, string>> {
  switch (evento.tipo) {
    case "TICKET_CREADO":
      return {
        mensaje:
          (await renderizarPlantilla("TICKET_CREADO", {
            numeroTicket: evento.numeroTicket,
            clienteNombre: evento.clienteNombre,
            titulo: evento.titulo,
            prioridad: evento.prioridad,
          })) ?? "",
      };
    case "TICKET_ASIGNADO":
      return {
        mensajeTecnico:
          (await renderizarPlantilla("TICKET_ASIGNADO_TECNICO", {
            numeroTicket: evento.numeroTicket,
            clienteNombre: evento.clienteNombre,
            titulo: evento.titulo,
            prioridad: evento.prioridad,
          })) ?? "",
        mensajeCliente:
          (await renderizarPlantilla("TICKET_ASIGNADO_CLIENTE", {
            numeroTicket: evento.numeroTicket,
            tecnicoNombre: evento.tecnicoNombre,
          })) ?? "",
      };
    case "TICKET_CAMBIO_ESTADO":
      return {
        mensaje:
          (await renderizarPlantilla("TICKET_CAMBIO_ESTADO", {
            numeroTicket: evento.numeroTicket,
            estadoNuevo: evento.estadoNuevo,
          })) ?? "",
      };
    case "SLA_EN_RIESGO":
      return {
        mensaje:
          (await renderizarPlantilla("SLA_EN_RIESGO", {
            numeroTicket: evento.numeroTicket,
            clienteNombre: evento.clienteNombre,
            titulo: evento.titulo,
            prioridad: evento.prioridad,
            estadoSla: evento.estadoSla,
          })) ?? "",
      };
    case "CONTACTO_CREADO":
      return {
        mensaje:
          (await renderizarPlantilla("CONTACTO_CREADO", {
            nombre: evento.nombre,
            clienteNombre: evento.clienteNombre,
          })) ?? "",
      };
    case "CONTACTO_NO_IDENTIFICADO":
      // Es un aviso interno al staff, no al contacto — sin plantilla en esta primera etapa.
      return {};
  }
}

async function enviarWebhook(evento: EventoWebhook): Promise<void> {
  // obtenerConfiguracion() ya resuelve BD -> .env -> defaults fijos, en ese orden — no
  // hay que repetir esa cadena de fallback aquí.
  const config = await obtenerConfiguracion();
  if (!config.webhooksHabilitados || !config.webhookUrl) return;

  const { tipo, ...data } = evento;
  const mensajes = await renderizarMensajesEvento(evento);
  // empresaNombre al nivel raíz (no dentro de `data`) para que cualquier nodo de n8n lo
  // lea con {{$json.empresaNombre}} sin importar el tipo de evento — así los mensajes de
  // bienvenida/alertas dejan de tener "NexIT" fijo en el texto cuando se renombra la empresa.
  const body = JSON.stringify({
    evento: tipo,
    timestamp: new Date().toISOString(),
    empresaNombre: config.empresaNombre,
    data: { ...data, ...mensajes },
  });
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
