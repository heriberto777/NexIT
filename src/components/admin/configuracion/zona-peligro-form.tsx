"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetearDatosPrueba } from "@/server/actions/admin/resetear-datos-prueba";
import { FRASE_CONFIRMACION_RESET } from "@/lib/utils/reset-datos-prueba";
import { Button } from "@/components/ui/button";

export interface ConteoDatosPrueba {
  tickets: number;
  notificaciones: number;
  conversaciones: number;
  contactosPendientes: number;
}

// Solo se monta cuando ALLOW_DATA_RESET="true" (ver configuracion/page.tsx) — el server
// action vuelve a revisar ese mismo flag por su cuenta, así que ocultar este formulario
// no es la única barrera, es la primera.
export function ZonaPeligroForm({ conteo }: { conteo: ConteoDatosPrueba }) {
  const router = useRouter();
  const [confirmacion, setConfirmacion] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const habilitado = confirmacion === FRASE_CONFIRMACION_RESET;

  async function ejecutar() {
    setError(null);
    setResultado(null);
    setIsPending(true);
    const resultadoAccion = await resetearDatosPrueba({ confirmacion });
    setIsPending(false);
    if (!resultadoAccion.ok) {
      setError(resultadoAccion.error);
      return;
    }
    const r = resultadoAccion.data;
    setResultado(
      `Listo: ${r.tickets} tickets, ${r.notificaciones} notificaciones, ${r.conversaciones} conversaciones y ${r.contactosPendientes} contactos pendientes eliminados.`,
    );
    setConfirmacion("");
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-xl border-2 border-red-200 bg-red-50/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-red-900">Zona de peligro — reset de datos de prueba</h2>
        <p className="mt-1 text-xs text-red-800">
          Disponible solo en este entorno (<code>ALLOW_DATA_RESET</code> activo) — nunca aparece en producción. Borra
          permanentemente <strong>tickets, su historial, evidencias, firmas, cotizaciones, notificaciones,
          conversaciones de chat y contactos pendientes</strong>. Nunca toca Clientes, Sucursales, Activos, Sistemas
          de software ni Usuarios.
        </p>
        <p className="mt-2 text-xs text-red-700">
          No revierte el stock de repuestos ya descontado ni borra archivos subidos (evidencias/firmas) del
          almacenamiento — solo las filas de la base de datos.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-red-900 sm:grid-cols-4">
        <div className="rounded-lg bg-white/60 p-2">
          <dt className="text-red-600">Tickets</dt>
          <dd className="text-sm font-semibold">{conteo.tickets}</dd>
        </div>
        <div className="rounded-lg bg-white/60 p-2">
          <dt className="text-red-600">Notificaciones</dt>
          <dd className="text-sm font-semibold">{conteo.notificaciones}</dd>
        </div>
        <div className="rounded-lg bg-white/60 p-2">
          <dt className="text-red-600">Conversaciones</dt>
          <dd className="text-sm font-semibold">{conteo.conversaciones}</dd>
        </div>
        <div className="rounded-lg bg-white/60 p-2">
          <dt className="text-red-600">Contactos pendientes</dt>
          <dd className="text-sm font-semibold">{conteo.contactosPendientes}</dd>
        </div>
      </dl>

      {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>}
      {resultado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{resultado}</p>}

      <div>
        <label className="mb-1 block text-xs font-medium text-red-900">
          Escribí exactamente <code>{FRASE_CONFIRMACION_RESET}</code> para habilitar el botón
        </label>
        <input
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm"
          placeholder={FRASE_CONFIRMACION_RESET}
          autoComplete="off"
        />
      </div>

      <Button type="button" variant="danger" disabled={!habilitado || isPending} onClick={ejecutar}>
        {isPending ? "Borrando..." : "Borrar datos de prueba"}
      </Button>
    </section>
  );
}
