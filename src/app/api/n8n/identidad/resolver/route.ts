import { NextResponse } from "next/server";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { resolverIdentidadSchema } from "@/lib/zod/n8n.schema";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";

export const dynamic = "force-dynamic";

// Punto de entrada del router de un solo bot/número compartido entre cliente, técnico
// y staff (ver N8N_INTEGRATION.md §10) — a diferencia de contexto-cliente/
// tecnico-contexto/staff-verificar, este endpoint NO asume ningún rol de antemano: solo
// dice "quién es y qué rol tiene", para que el workflow arme un Switch por rol ANTES de
// invocar el sub-flujo correspondiente. Esos 3 endpoints siguen haciendo su propia
// verificación cuando el Switch los invoque — la redundancia de una query extra es
// aceptable a cambio de no duplicar sus reglas de negocio acá.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const { searchParams } = new URL(request.url);
  const parsed = resolverIdentidadSchema.safeParse({
    canal: searchParams.get("canal"),
    identificador: searchParams.get("identificador"),
    texto: searchParams.get("texto") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;

  const responder = (body: Record<string, unknown>) => NextResponse.json({ ...body, canal, identificador, texto });

  const usuario = await resolverUsuarioPorChatId(canal, identificador);

  if (!usuario) {
    return responder({ encontrado: false, rol: null, motivo: "NO_ENCONTRADO" });
  }
  if (usuario.estado !== "ACTIVO") {
    return responder({ encontrado: false, rol: null, motivo: "INACTIVO" });
  }

  return responder({ encontrado: true, rol: usuario.rol, usuarioNombre: usuario.nombre });
}
