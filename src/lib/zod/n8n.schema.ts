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
