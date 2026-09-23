"use server";

import { requireUsuario } from "@/server/auth/session";
import { probarWebhook } from "@/server/services/webhook.service";
import { probarEnvioSmtp } from "@/server/services/email.service";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

async function verificarAcceso() {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede probar integraciones`);
  }
}

export async function probarWebhookAction() {
  await verificarAcceso();
  return probarWebhook();
}

export async function probarSmtpAction() {
  await verificarAcceso();
  return probarEnvioSmtp();
}
