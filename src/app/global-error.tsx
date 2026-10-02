"use client";

// Mismo propósito que error.tsx, pero cubre un error dentro del propio RootLayout (ej.
// si obtenerConfiguracion() fallara en generateMetadata/layout) — un caso borde que
// error.tsx no puede capturar porque vive adentro del layout que falló. Por eso declara
// su propio <html>/<body>: en este caso específico reemplaza al layout entero, no
// renderiza dentro de él.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body>
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
          <p className="text-sm text-gray-600">La aplicación no pudo cargar. Intentá de nuevo en unos segundos.</p>
          {error.digest && <p className="text-xs text-gray-400">Código de referencia: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
