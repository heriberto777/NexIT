import { z } from "zod";

export const tipoEvidenciaSchema = z.enum(["FOTO_ANTES", "FOTO_DESPUES", "DOCUMENTO", "OTRO"]);

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

export const marcarEvidenciaNoAplicaSchema = z.object({
  ticketId: z.string().cuid(),
  motivo: z.string().trim().min(5, "Explica brevemente por qué no aplica").max(500),
});
export type MarcarEvidenciaNoAplicaInput = z.infer<typeof marcarEvidenciaNoAplicaSchema>;
