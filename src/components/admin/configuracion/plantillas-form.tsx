"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarPlantillaNotificacion } from "@/server/actions/admin/guardar-plantilla-notificacion";
import { restablecerPlantillaNotificacion } from "@/server/actions/admin/restablecer-plantilla-notificacion";

export interface PlantillaValue {
  clave: string;
  nombre: string;
  descripcion: string;
  placeholders: string[];
  cuerpoPorDefecto: string;
  // null = sin override, usa cuerpoPorDefecto tal cual.
  cuerpoPersonalizado: string | null;
}

// Una fila editable por plantilla del catálogo fijo (ver plantilla-notificacion.service.ts)
// — no se pueden crear ni eliminar plantillas desde acá, solo personalizar/restablecer el
// texto de cada una. El webhook ya manda este texto renderizado en `data.mensaje`
// (o mensajeTecnico/mensajeCliente); los workflows de n8n todavía no lo consumen — eso
// queda para una edición posterior de los 7 workflows.
export function PlantillasForm({ plantillas }: { plantillas: PlantillaValue[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(plantillas.map((p) => [p.clave, p.cuerpoPersonalizado ?? p.cuerpoPorDefecto]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  async function guardar(clave: string) {
    setError(null);
    setMensajeOk(null);
    setGuardando(clave);
    try {
      await guardarPlantillaNotificacion({ clave, cuerpo: valores[clave] });
      setMensajeOk(`Mensaje de "${clave}" actualizado.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setGuardando(null);
    }
  }

  async function restablecer(clave: string, cuerpoPorDefecto: string) {
    setError(null);
    setMensajeOk(null);
    setGuardando(clave);
    try {
      await restablecerPlantillaNotificacion({ clave });
      setValores((prev) => ({ ...prev, [clave]: cuerpoPorDefecto }));
      setMensajeOk(`Mensaje de "${clave}" restablecido al valor por defecto.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">Plantillas de mensajes</p>
        <p className="text-xs text-gray-400">
          Texto que se envía por correo, Telegram y WhatsApp en cada evento. Usá <code>{"{{placeholder}}"}</code> para
          insertar datos del ticket/contacto — se reemplazan automáticamente al enviar.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensajeOk && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensajeOk}</p>}

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {plantillas.map((p) => {
          const tieneOverride = p.cuerpoPersonalizado !== null;
          const valor = valores[p.clave] ?? p.cuerpoPorDefecto;
          const sinCambios = valor === (p.cuerpoPersonalizado ?? p.cuerpoPorDefecto);
          return (
            <div key={p.clave} className="space-y-2 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                <p className="text-xs text-gray-400">{p.descripcion}</p>
                {p.placeholders.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    Disponibles:{" "}
                    {p.placeholders.map((ph) => (
                      <code key={ph} className="mr-1 rounded bg-gray-100 px-1 py-0.5">{`{{${ph}}}`}</code>
                    ))}
                  </p>
                )}
              </div>
              <textarea
                value={valor}
                onChange={(ev) => setValores((prev) => ({ ...prev, [p.clave]: ev.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={guardando === p.clave || sinCambios}
                  onClick={() => guardar(p.clave)}
                  className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                >
                  {guardando === p.clave ? "Guardando..." : "Guardar"}
                </button>
                {tieneOverride && (
                  <button
                    type="button"
                    disabled={guardando === p.clave}
                    onClick={() => restablecer(p.clave, p.cuerpoPorDefecto)}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Restablecer a default
                  </button>
                )}
                {tieneOverride && <span className="text-xs text-gray-400">Personalizado</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
