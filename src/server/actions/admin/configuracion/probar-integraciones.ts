"use server";

import { requireUsuario } from "@/server/auth/session";
import { probarWebhook, type ResultadoPruebaWebhook } from "@/server/services/webhook.service";
import { probarEnvioSmtp, type ResultadoPruebaSmtp } from "@/server/services/email.service";
import { probarConexionIA, type ResultadoPruebaIA } from "@/server/services/ia.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

async function verificarAcceso() {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede probar integraciones`);
  }
}

// probarWebhook()/probarEnvioSmtp() ya devuelven su propio { ok, mensaje } (nunca
// lanzan) — el ActionResult de acá solo envuelve el chequeo de rol, que sí puede lanzar.
export async function probarWebhookAction(): Promise<ActionResult<ResultadoPruebaWebhook>> {
  return ejecutarAccion(async () => {
    await verificarAcceso();
    return probarWebhook();
  });
}

export async function probarSmtpAction(): Promise<ActionResult<ResultadoPruebaSmtp>> {
  return ejecutarAccion(async () => {
    await verificarAcceso();
    return probarEnvioSmtp();
  });
}

export async function probarIaAction(): Promise<ActionResult<ResultadoPruebaIA>> {
  return ejecutarAccion(async () => {
    await verificarAcceso();
    return probarConexionIA();
  });
}
