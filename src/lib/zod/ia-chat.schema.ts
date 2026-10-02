import { z } from "zod";

export const enviarMensajeIaSchema = z.object({
  ticketId: z.string().cuid(),
  mensaje: z.string().trim().min(1, "Escribí un mensaje").max(2000),
});
export type EnviarMensajeIaInput = z.infer<typeof enviarMensajeIaSchema>;

export const marcarRespuestaIaValidaSchema = z.object({
  mensajeId: z.string().cuid(),
});
export type MarcarRespuestaIaValidaInput = z.infer<typeof marcarRespuestaIaValidaSchema>;
