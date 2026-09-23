import { z } from "zod";
import { optionalCuid } from "@/lib/zod/shared";

export const tipoTicketSchema = z.enum(["CORRECTIVO", "PREVENTIVO", "INSTALACION"]);
export const categoriaSoporteSchema = z.enum(["SOFTWARE", "HARDWARE", "INFRAESTRUCTURA"]);
export const prioridadSchema = z.enum(["CRITICA", "ALTA", "MEDIA", "BAJA"]);
export const estadoTicketSchema = z.enum([
  "ABIERTO",
  "ASIGNADO",
  "EN_DIAGNOSTICO",
  "ESPERANDO_REPUESTO",
  "EN_EJECUCION",
  "ESPERANDO_VALIDACION",
  "RESUELTO",
  "REABIERTO",
  "CERRADO",
  "CANCELADO",
]);

// Creación manual por staff (Admin/Coordinador/Técnico) — típicamente cuando un cliente
// llama por teléfono en vez de reportar desde el portal. clienteId viaja en el input
// (a diferencia de crearTicketPortalSchema, donde sale de la sesión) porque aquí el
// staff elige a qué cliente pertenece.
export const crearTicketSchema = z.object({
  clienteId: z.string().cuid(),
  sucursalId: z.string().cuid(),
  activoId: optionalCuid(),
  ubicacionNoCatalogada: z.string().trim().max(200).optional(),
  tipo: tipoTicketSchema,
  categoriaSoporte: categoriaSoporteSchema,
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(120),
  descripcion: z.string().trim().min(20, "Describe el problema con al menos 20 caracteres").max(4000),
  prioridad: prioridadSchema,
  contactoNombre: z.string().trim().min(2, "Indica con quién se habló").max(120),
  contactoTelefono: z.string().trim().min(7, "Indica un teléfono de contacto").max(20),
});
export type CrearTicketInput = z.infer<typeof crearTicketSchema>;

// Asignación por el coordinador
export const asignarTicketSchema = z.object({
  ticketId: z.string().cuid(),
  tecnicoId: z.string().cuid(),
});
export type AsignarTicketInput = z.infer<typeof asignarTicketSchema>;

// Transición de estado (con comentario obligatorio en ciertos casos)
export const cambiarEstadoTicketSchema = z
  .object({
    ticketId: z.string().cuid(),
    estadoNuevo: estadoTicketSchema,
    comentario: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => data.estadoNuevo !== "REABIERTO" || (data.comentario?.length ?? 0) > 0,
    { message: "Debes indicar por qué se reabre el ticket", path: ["comentario"] },
  );
export type CambiarEstadoTicketInput = z.infer<typeof cambiarEstadoTicketSchema>;

// Validación de la visita por el Cliente (o Admin como override): aprobar cierra el
// ciclo (-> RESUELTO), rechazar reabre el ticket y exige justificar por qué.
export const validarVisitaSchema = z
  .object({
    ticketId: z.string().cuid(),
    decision: z.enum(["APROBAR", "RECHAZAR"]),
    comentario: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.decision !== "RECHAZAR" || (data.comentario?.length ?? 0) > 0, {
    message: "Indica por qué se rechaza/reabre la visita",
    path: ["comentario"],
  });
export type ValidarVisitaInput = z.infer<typeof validarVisitaSchema>;

// Cierre administrativo (Coordinador/Admin): RESUELTO -> CERRADO
export const cerrarTicketSchema = z.object({
  ticketId: z.string().cuid(),
});
export type CerrarTicketInput = z.infer<typeof cerrarTicketSchema>;

// Edición de campos básicos por Coordinador/Admin — no toca estado, técnico ni SLA.
export const editarTicketSchema = z.object({
  ticketId: z.string().cuid(),
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(120),
  descripcion: z.string().trim().min(10, "Describe el problema con al menos 10 caracteres").max(4000),
  prioridad: prioridadSchema,
});
export type EditarTicketInput = z.infer<typeof editarTicketSchema>;

// Cancelación administrativa (Coordinador/Admin): cualquier estado no terminal -> CANCELADO
export const cancelarTicketSchema = z.object({
  ticketId: z.string().cuid(),
  motivo: z.string().trim().min(5, "Indica el motivo de la cancelación").max(500),
});
export type CancelarTicketInput = z.infer<typeof cancelarTicketSchema>;

// Solicitud de cotización adicional (Técnico/Coordinador/Admin)
export const crearCotizacionSchema = z.object({
  ticketId: z.string().cuid(),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").max(1_000_000),
  descripcion: z.string().trim().min(10, "Describe con al menos 10 caracteres qué cubre este costo adicional").max(1000),
});
export type CrearCotizacionInput = z.infer<typeof crearCotizacionSchema>;

// Aprobación/rechazo de cotización por el cliente
export const resolverCotizacionSchema = z
  .object({
    cotizacionId: z.string().cuid(),
    decision: z.enum(["APROBADO", "RECHAZADO"]),
    comentario: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.decision !== "RECHAZADO" || (data.comentario?.length ?? 0) > 0, {
    message: "Indica el motivo del rechazo",
    path: ["comentario"],
  });
export type ResolverCotizacionInput = z.infer<typeof resolverCotizacionSchema>;
