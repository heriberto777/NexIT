"use server";

import { requireUsuario } from "@/server/auth/session";
import { actualizarConfiguracion } from "@/server/services/configuracion.service";
import { guardarWebhooksSchema } from "@/lib/zod/configuracion.schema";
import type { GuardarWebhooksInput } from "@/lib/zod/configuracion.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function guardarWebhooks(input: GuardarWebhooksInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
  }

  const { webhookUrl, webhookSecret, webhooksHabilitados } = guardarWebhooksSchema.parse(input);

  await actualizarConfiguracion({
    webhookUrl: webhookUrl || null,
    // Igual que smtpPass: campo vacío = "no cambiar el secreto ya guardado" — nunca se
    // manda el valor real de vuelta al formulario para que el admin lo reescriba.
    ...(webhookSecret ? { webhookSecret } : {}),
    webhooksHabilitados,
  });

  return { ok: true };
}
