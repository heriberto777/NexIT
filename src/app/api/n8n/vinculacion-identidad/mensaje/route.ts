import { NextResponse } from "next/server";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { mensajeConversacionSchema } from "@/lib/zod/n8n.schema";
import { procesarMensajeVinculacion } from "@/server/services/vinculacion-identidad.service";

export const dynamic = "force-dynamic";

// Lo llama n8n SOLO cuando conversacion/mensaje (o tecnico/contexto) ya no encontró al
// usuario por whatsappTelefono/telegramChatId/whatsappIdentificadorAlterno. Si
// `continuar: true`, el workflow debe seguir con POST contacto-pendiente/mensaje (mismo
// body) — este endpoint ya decidió que ese correo no pertenece a ningún Usuario de
// NexIT, así que no es su problema resolverlo.
export async function POST(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const body = await request.json().catch(() => null);
  const parsed = mensajeConversacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;

  const resultado = await procesarMensajeVinculacion({ canal, identificador, texto });

  return NextResponse.json({ ...resultado, canal, identificador, texto });
}
