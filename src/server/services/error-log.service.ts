import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Reemplaza/complementa los console.error sueltos que antes solo se veían con
// `docker logs`: sigue mandando a consola (para no perder visibilidad si la escritura
// a BD también falla) pero además persiste el error para verlo desde /admin/logs.
// Nunca lanza — quien llama a esto ya está dentro de su propio manejo de errores.
export function registrarError(origen: string, error: unknown, contexto?: Record<string, unknown>): void {
  console.error(`[${origen}]`, error);

  const mensaje = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  void prisma.registroError
    .create({
      data: { origen, mensaje, stack, contexto: (contexto as Prisma.InputJsonValue) ?? undefined },
    })
    .catch((e) => {
      console.error("[error-log] No se pudo persistir el error:", e);
    });
}
