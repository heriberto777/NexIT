import { z } from "zod";

// Vacío/undefined se guarda como null (desvincular el canal) — nunca como string
// vacío, para que el índice @unique de Prisma no choque entre dos usuarios que
// "no tienen" Telegram vinculado.
const canalOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const editarPerfilSchema = z.object({
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  telegramChatId: canalOpcional(40),
  whatsappTelefono: canalOpcional(20),
});
export type EditarPerfilInput = z.infer<typeof editarPerfilSchema>;

export const cambiarPasswordPropioSchema = z
  .object({
    passwordActual: z.string().min(1, "Requerido"),
    passwordNueva: z.string().min(8, "Mínimo 8 caracteres").max(100),
    passwordNuevaConfirmar: z.string().min(1, "Requerido"),
  })
  .refine((data) => data.passwordNueva === data.passwordNuevaConfirmar, {
    message: "Las contraseñas no coinciden",
    path: ["passwordNuevaConfirmar"],
  });
export type CambiarPasswordPropioInput = z.infer<typeof cambiarPasswordPropioSchema>;
