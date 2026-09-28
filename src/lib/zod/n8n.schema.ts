import { z } from "zod";
import { optionalCuid } from "@/lib/zod/shared";
import { categoriaSoporteSchema, prioridadSchema, tipoTicketSchema } from "@/lib/zod/ticket.schema";

// "Canal" identifica de qué integración viene el mensaje — determina contra qué
// columna de Usuario (telegramChatId vs whatsappTelefono) se resuelve `identificador`.
export const canalChatSchema = z.enum(["TELEGRAM", "WHATSAPP"]);
export type CanalChat = z.infer<typeof canalChatSchema>;

// `texto` es puro passthrough: el endpoint no lo usa para nada, solo lo hace viajar de
// vuelta en la respuesta — un nodo HTTP Request de n8n reemplaza $json con el body de
// la respuesta, así que sin este eco el mensaje original del usuario se perdería antes
// de llegar al paso de IA que lo necesita.
export const contextoClienteSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  texto: z.string().trim().max(4000).optional(),
});
export type ContextoClienteInput = z.infer<typeof contextoClienteSchema>;

// El agente de IA en n8n manda estos campos ya extraídos del mensaje libre del
// cliente — categoriaSoporte/tipo/prioridad tienen default porque un mensaje de chat
// casual ("no prende el switch") casi nunca los menciona explícitamente.
export const crearTicketChatSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(120),
  descripcion: z.string().trim().min(10, "Describe el problema con al menos 10 caracteres").max(4000),
  tipo: tipoTicketSchema.default("CORRECTIVO"),
  categoriaSoporte: categoriaSoporteSchema.default("SOFTWARE"),
  prioridad: prioridadSchema.default("MEDIA"),
  sucursalId: optionalCuid(),
  activoId: optionalCuid(),
});
export type CrearTicketChatInput = z.infer<typeof crearTicketChatSchema>;

// ---------- Técnico: seguimiento de tickets asignados por chat ----------

export const identidadChatSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
});
export type IdentidadChatInput = z.infer<typeof identidadChatSchema>;

// texto/tieneFoto/fileId/mediaUrl son puro passthrough (mismo motivo que `texto` en
// contextoClienteSchema): el workflow de técnico necesita saber si el mensaje traía una
// foto y desde dónde descargarla DESPUÉS de esta llamada, que ya pisó el $json original.
export const contextoTecnicoSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  texto: z.string().trim().max(4000).optional(),
  tieneFoto: z.string().trim().optional(),
  fileId: z.string().trim().optional(),
  mediaUrl: z.string().trim().optional(),
});
export type ContextoTecnicoInput = z.infer<typeof contextoTecnicoSchema>;

export const checkinTecnicoSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  numeroTicket: z.string().trim().min(1, "Requerido"),
});
export type CheckinTecnicoInput = z.infer<typeof checkinTecnicoSchema>;

export const notaTecnicoSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  numeroTicket: z.string().trim().min(1, "Requerido"),
  comentario: z.string().trim().min(1, "Requerido").max(2000),
});
export type NotaTecnicoInput = z.infer<typeof notaTecnicoSchema>;

// ---------- Coordinador/Admin: consultas y estadísticas por chat ----------

// `texto` viaja de ida y vuelta por el mismo motivo que en contextoTecnicoSchema: el
// workflow necesita la pregunta original DESPUÉS de llamar a /staff/resumen (que no
// la recibe ni la devuelve, porque es un snapshot de datos sin identidad de por medio).
export const verificarStaffSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  texto: z.string().trim().max(4000).optional(),
});
export type VerificarStaffInput = z.infer<typeof verificarStaffSchema>;

// imagenBase64 sin el prefijo "data:image/...;base64," — ese prefijo se separa en el
// paso de n8n que descarga el archivo de Telegram/Twilio, antes de mandarlo acá.
export const evidenciaTecnicoSchema = z.object({
  canal: canalChatSchema,
  identificador: z.string().trim().min(1, "Requerido"),
  numeroTicket: z.string().trim().min(1, "Requerido"),
  imagenBase64: z.string().trim().min(1, "Requerido"),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/jpeg"),
});
export type EvidenciaTecnicoInput = z.infer<typeof evidenciaTecnicoSchema>;
