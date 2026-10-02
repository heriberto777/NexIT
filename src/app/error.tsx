"use client";

import { useEffect } from "react";

// Red de seguridad para errores NO esperados durante el render de una página (ej. la
// base de datos no responde al cargar /admin/usuarios) — distinto del manejo de
// Server Actions (ver src/server/actions/action-result.ts), que nunca debería llegar
// hasta acá porque siempre resuelve a un ActionResult, nunca lanza. Sin este archivo,
// un error sin capturar rompía toda la pantalla con el error crudo de Next.js/React
// (o, en producción, el genérico "Minified React error #441" sin ninguna salida).
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
      <p className="text-sm text-gray-600">
        Ocurrió un error inesperado al cargar esta página. Podés intentar de nuevo o volver más tarde.
      </p>
      {error.digest && <p className="text-xs text-gray-400">Código de referencia: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Reintentar
      </button>
    </div>
  );
}
