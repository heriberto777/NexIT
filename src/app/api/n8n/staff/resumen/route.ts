import { NextResponse } from "next/server";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { obtenerResumenStaff } from "@/server/services/resumen-staff.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

// Sin verificación de identidad (a diferencia de /api/n8n/staff/verificar) — solo
// protegido por WEBHOOK_SECRET, para poder reusarlo tanto desde el workflow de
// consultas on-demand (después de pasar por /verificar) como desde los resúmenes
// programados (grupo único o personalizado por persona). Misma data que /admin.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const [resumen, { empresaNombre }] = await Promise.all([obtenerResumenStaff(), obtenerConfiguracion()]);
  return NextResponse.json({ ...resumen, empresaNombre });
}
