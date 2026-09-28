import { NextResponse } from "next/server";
import { revisarTicketsEnRiesgo } from "@/server/services/sla-monitor.service";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";

// Sin sesión de usuario (lo golpea un cron externo, no un navegador logueado) — se
// protege con el mismo secreto configurado en /admin/configuracion (o su fallback a
// WEBHOOK_SECRET si la BD no está inicializada) para no sumar otra variable aparte.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const resultado = await revisarTicketsEnRiesgo();
  return NextResponse.json(resultado);
}
