import { NextResponse } from "next/server";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { verificarStaffSchema } from "@/lib/zod/n8n.schema";
import { resolverUsuarioPorChatId } from "@/server/services/vinculacion-identidad.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

// Paso previo obligatorio antes de responder cualquier comando/consulta de chat a
// Coordinador/Admin — separado de /api/n8n/staff/resumen (que no valida identidad,
// solo el WEBHOOK_SECRET) para que el resumen se pueda reusar también desde el
// workflow de resumen diario programado, que no tiene un "usuario" detrás.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const { searchParams } = new URL(request.url);
  const parsed = verificarStaffSchema.safeParse({
    canal: searchParams.get("canal"),
    identificador: searchParams.get("identificador"),
    texto: searchParams.get("texto") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }
  const { canal, identificador, texto } = parsed.data;

  const usuario = await resolverUsuarioPorChatId(canal, identificador);

  if (!usuario || (usuario.rol !== "ADMIN" && usuario.rol !== "COORDINADOR") || usuario.estado !== "ACTIVO") {
    const { empresaNombre } = await obtenerConfiguracion();
    return NextResponse.json({
      autorizado: false,
      mensaje: `No encontramos tu número vinculado a ${empresaNombre} con un rol autorizado (Admin o Coordinador).`,
      canal,
      identificador,
      texto,
    });
  }

  const { empresaNombre } = await obtenerConfiguracion();
  return NextResponse.json({ autorizado: true, empresaNombre, usuarioNombre: usuario.nombre, rol: usuario.rol, canal, identificador, texto });
}
