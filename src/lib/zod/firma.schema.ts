import { z } from "zod";

export const capturarFirmaSchema = z.object({
  ticketId: z.string().cuid(),
  nombreFirmante: z.string().trim().min(3).max(120),
  cargoFirmante: z.string().trim().max(120).optional(),
  // PNG del canvas de firma en base64 (se sube a storage antes de persistir la URL)
  firmaBase64: z.string().startsWith("data:image/png;base64,"),
  confirmaConformidad: z.literal(true, {
    errorMap: () => ({ message: "Debes confirmar la conformidad del trabajo" }),
  }),
});
export type CapturarFirmaInput = z.infer<typeof capturarFirmaSchema>;
