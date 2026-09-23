"use server";

import { requireUsuario } from "@/server/auth/session";
import { actualizarConfiguracion } from "@/server/services/configuracion.service";
import { guardarSmtpSchema } from "@/lib/zod/configuracion.schema";
import type { GuardarSmtpInput } from "@/lib/zod/configuracion.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function guardarSmtp(input: GuardarSmtpInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFromEmail, smtpFromName, smtpSsl } = guardarSmtpSchema.parse(input);

  await actualizarConfiguracion({
    smtpHost: smtpHost || null,
    smtpPort: smtpPort ?? null,
    smtpUser: smtpUser || null,
    // Campo vacío significa "no cambiar" cuando ya había una contraseña guardada — así
    // el formulario no obliga a re-escribir la contraseña SMTP cada vez que se toca
    // otro campo de esta pestaña (el valor real nunca se manda de vuelta al cliente).
    ...(smtpPass ? { smtpPass } : {}),
    smtpFromEmail: smtpFromEmail || null,
    smtpFromName: smtpFromName || null,
    smtpSsl,
  });

  return { ok: true };
}
