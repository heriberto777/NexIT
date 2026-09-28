"use server";

import crypto from "node:crypto";
import { requireUsuario } from "@/server/auth/session";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

// No persiste nada — solo genera un valor aleatorio fuerte para que el admin lo vea,
// lo copie a la variable WEBHOOK_SECRET de su instancia de n8n, y recién lo guarde con
// "Guardar cambios" (mismo flujo que si lo hubiera tipeado a mano). Evita que el
// secreto termine siendo algo corto o adivinable inventado a mano.
export async function generarWebhookSecret() {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede generar secretos de integración`);
  }

  return { secreto: crypto.randomBytes(32).toString("base64url") };
}
