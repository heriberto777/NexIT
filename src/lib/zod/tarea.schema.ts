import { z } from "zod";

export const estadoTareaSchema = z.enum(["PENDIENTE", "EN_PROGRESO", "COMPLETADA", "CANCELADA"]);

export const crearTareaSchema = z.object({
  ticketId: z.string().cuid(),
  titulo: z.string().trim().min(3, "Mínimo 3 caracteres").max(160),
  asignadoAId: z.string().cuid().optional(),
});
export type CrearTareaInput = z.infer<typeof crearTareaSchema>;

export const cambiarEstadoTareaSchema = z.object({
  tareaId: z.string().cuid(),
  estado: estadoTareaSchema,
});
export type CambiarEstadoTareaInput = z.infer<typeof cambiarEstadoTareaSchema>;

// null = quitar la asignación (vuelve a "sin asignar"), no es lo mismo que omitir el
// campo — por eso es explícitamente nullable y no opcional.
export const reasignarTareaSchema = z.object({
  tareaId: z.string().cuid(),
  asignadoAId: z.string().cuid().nullable(),
});
export type ReasignarTareaInput = z.infer<typeof reasignarTareaSchema>;

// Un comentario necesita texto, foto, o ambos — nunca los dos vacíos (ver .refine).
// mencionadosIds viaja como la lista de usuarioId ya resueltos por MentionTextarea, nunca
// como texto "@algo" a parsear en el servidor (ver análisis "Tareas dentro de un ticket").
export const comentarTareaSchema = z
  .object({
    tareaId: z.string().cuid(),
    comentario: z.string().trim().max(2000).optional(),
    fotoArchivo: z.string().trim().min(1).optional(),
    mencionadosIds: z.array(z.string().cuid()).max(10).default([]),
  })
  .refine((data) => Boolean(data.comentario?.length) || Boolean(data.fotoArchivo), {
    message: "Escribe un comentario o adjunta una foto",
    path: ["comentario"],
  });
export type ComentarTareaInput = z.infer<typeof comentarTareaSchema>;
