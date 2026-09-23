import { z } from "zod";

export const tipoEvidenciaSchema = z.enum(["FOTO_ANTES", "FOTO_DESPUES", "DOCUMENTO", "OTRO"]);

export const registrarEvidenciaSchema = z.object({
  ticketId: z.string().cuid(),
  tipo: tipoEvidenciaSchema,
  urlArchivo: z.string().url(),
});
export type RegistrarEvidenciaInput = z.infer<typeof registrarEvidenciaSchema>;

export const registrarRepuestoSchema = z.object({
  ticketId: z.string().cuid(),
  repuestoId: z.string().cuid(),
  cantidad: z.coerce.number().int().positive(),
});
export type RegistrarRepuestoInput = z.infer<typeof registrarRepuestoSchema>;

export const finalizarVisitaSchema = z.object({
  ticketId: z.string().cuid(),
  notasInternas: z.string().trim().max(2000).optional(),
});
export type FinalizarVisitaInput = z.infer<typeof finalizarVisitaSchema>;
