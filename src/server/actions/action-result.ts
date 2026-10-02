import { registrarError } from "@/server/services/error-log.service";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const MENSAJE_GENERICO = "Ocurrió un error inesperado. Intenta de nuevo o contacta a soporte si persiste.";

// Next.js/React NUNCA mandan el `message` de un error lanzado desde una Server Action al
// cliente cuando corren en producción — solo un "digest" opaco (por diseño, para no
// filtrar detalles del servidor; en desarrollo sí se ve el mensaje real, lo que ocultó
// este problema hasta que se probó un build de producción). Esto rompía silenciosamente
// CUALQUIER `throw new Error("mensaje amigable")` de validación de negocio en producción:
// el usuario veía "Minified React error #441" en vez de, por ejemplo, "ya existe un
// usuario con ese correo".
//
// Por eso ninguna Server Action debe devolver su resultado lanzando una excepción — todas
// envuelven su cuerpo en `ejecutarAccion()`, que SIEMPRE resuelve a un ActionResult:
//   - Un `throw new Error(...)` propio (una validación/regla de negocio escrita a mano en
//     el código de la acción) se trata como "esperado" y su mensaje viaja intacto al
//     cliente — se distingue por ser una instancia de `Error` pura (constructor === Error),
//     no una subclase (ZodError, errores de Prisma, etc.).
//   - Cualquier otro error (bug, Zod, Prisma, red) se oculta tras un mensaje genérico —
//     nunca se le muestra al usuario un stack trace o un detalle interno del servidor— y
//     se registra en error-log.service (visible en /admin/logs) para poder diagnosticarlo.
export async function ejecutarAccion<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) {
      return { ok: false, error: error.message };
    }
    registrarError("server-action", error);
    return { ok: false, error: MENSAJE_GENERICO };
  }
}
