import { NextResponse } from "next/server";
import { revisarTicketsEnRiesgo } from "@/server/services/sla-monitor.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// Sin sesión de usuario (lo golpea un cron externo, no un navegador logueado) — se
// protege con el mismo secreto configurado en /admin/configuracion (o su fallback a
// WEBHOOK_SECRET si la BD no está inicializada) para no sumar otra variable aparte.
export async function POST(request: Request) {
  const config = await obtenerConfiguracion();
  const secret = config.webhookSecret;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const resultado = await revisarTicketsEnRiesgo();
  return NextResponse.json(resultado);
}
