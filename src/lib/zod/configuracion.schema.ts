import { z } from "zod";

export const guardarBrandingSchema = z.object({
  empresaNombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(160),
  empresaRnc: z.string().trim().max(40).optional().or(z.literal("")),
  empresaTelefono: z.string().trim().max(30).optional().or(z.literal("")),
  empresaEmail: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  empresaDireccion: z.string().trim().max(200).optional().or(z.literal("")),
});
export type GuardarBrandingInput = z.infer<typeof guardarBrandingSchema>;

export const guardarSmtpSchema = z.object({
  smtpHost: z.string().trim().max(200).optional().or(z.literal("")),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().trim().max(200).optional().or(z.literal("")),
  smtpPass: z.string().trim().max(200).optional().or(z.literal("")),
  smtpFromEmail: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  smtpFromName: z.string().trim().max(120).optional().or(z.literal("")),
  smtpSsl: z.boolean(),
});
export type GuardarSmtpInput = z.infer<typeof guardarSmtpSchema>;

export const guardarWebhooksSchema = z.object({
  webhookUrl: z.string().trim().url("URL inválida").optional().or(z.literal("")),
  webhookSecret: z.string().trim().max(200).optional().or(z.literal("")),
  webhooksHabilitados: z.boolean(),
});
export type GuardarWebhooksInput = z.infer<typeof guardarWebhooksSchema>;

export const guardarParametrosSchema = z.object({
  slaHorasCritica: z.coerce.number().int().min(1).max(720),
  slaHorasAlta: z.coerce.number().int().min(1).max(720),
  slaHorasMedia: z.coerce.number().int().min(1).max(720),
  slaHorasBaja: z.coerce.number().int().min(1).max(720),
  diasAnticipacionPreventivos: z.coerce.number().int().min(0).max(60),
  monedaCodigo: z.string().trim().length(3, "Usa el código ISO 4217 de 3 letras (ej. DOP, USD)").toUpperCase(),
  monedaSimbolo: z.string().trim().min(1).max(10),
  localeFecha: z.string().trim().min(2).max(20),
  fotosMinimasEvidencia: z.coerce.number().int().min(0).max(20),
  evidenciaMaxMB: z.coerce.number().int().min(1).max(50),
  diasVentanaProximoPreventivo: z.coerce.number().int().min(0).max(90),
});
export type GuardarParametrosInput = z.infer<typeof guardarParametrosSchema>;
