import { z } from "zod";
import { categoriaSoporteSchema, prioridadSchema } from "@/lib/zod/ticket.schema";
import { optionalCuid } from "@/lib/zod/shared";

// Variante de crearTicketSchema para el portal de auto-servicio: sin `tipo` (el cliente
// siempre está "reportando una falla", el Server Action fija tipo=CORRECTIVO) y sin
// clienteId/contacto (se derivan de la sesión, nunca se confía en lo que mande el cliente).
export const crearTicketPortalSchema = z.object({
  sucursalId: z.string().cuid(),
  activoId: optionalCuid(),
  ubicacionNoCatalogada: z.string().trim().max(200).optional(),
  sistemaSoftwareId: optionalCuid(),
  // Texto libre cuando el problema es de "Sistema" pero no hay un SistemaSoftware
  // concreto del catálogo del cliente — también lo usa el wizard para anotar cuál de
  // las dos opciones genéricas (Sistema operativo / Suite de oficina) se eligió.
  sistemaNoCatalogado: z.string().trim().max(200).optional(),
  categoriaSoporte: categoriaSoporteSchema,
  titulo: z.string().trim().min(5, "Mínimo 5 caracteres").max(120),
  descripcion: z.string().trim().min(20, "Describe el problema con al menos 20 caracteres").max(4000),
  prioridadPercibida: prioridadSchema,
});
export type CrearTicketPortalInput = z.infer<typeof crearTicketPortalSchema>;

export const agregarComentarioSchema = z.object({
  ticketId: z.string().cuid(),
  mensaje: z.string().trim().min(1, "Escribe un mensaje").max(2000),
});
export type AgregarComentarioInput = z.infer<typeof agregarComentarioSchema>;
