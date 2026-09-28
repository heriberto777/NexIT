import { NextResponse } from "next/server";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// Mismo criterio que /api/cron/sla-check: estas rutas las golpea n8n, no un navegador
// logueado, así que se protegen con el WEBHOOK_SECRET configurado en
// /admin/configuracion (con su propio fallback a la env var) en vez de una sesión.
// Devuelve una respuesta 401 ya armada si el secreto falta/no coincide, o `null` si
// el caller puede seguir.
export async function verificarSecretoWebhook(request: Request): Promise<NextResponse | null> {
  const config = await obtenerConfiguracion();
  const secret = config.webhookSecret;
  if (!secret) return null;

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return null;
}
