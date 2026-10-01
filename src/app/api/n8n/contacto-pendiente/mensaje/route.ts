import { NextResponse } from "next/server";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { mensajeConversacionSchema } from "@/lib/zod/n8n.schema";
import { procesarMensajeContactoPendiente } from "@/server/services/contacto-pendiente.service";

export const dynamic = "force-dynamic";

// Lo llama el workflow del asistente IA (§6) cuando POST /conversacion/mensaje
// devolvió encontrado=false — en vez de relayar un único mensaje fijo, arranca (o
// continúa) la recolección de datos del contacto, un campo a la vez.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = mensajeConversacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;

  const { mensaje } = await procesarMensajeContactoPendiente({ canal, identificador, texto });

  return NextResponse.json({ mensaje, canal, identificador });
}
