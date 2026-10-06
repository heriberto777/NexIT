"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";
import { EstadoTareaBadge } from "@/components/tickets/tareas/estado-tarea-badge";
import { TareaDetalleModal } from "@/components/tickets/tareas/tarea-detalle-modal";
import { crearTarea } from "@/server/actions/tickets/tareas/crear-tarea";
import type { TareaUI, CandidatoTareaUI } from "@/components/tickets/tareas/types";

interface Props {
  ticketId: string;
  tareas: TareaUI[];
  candidatos: CandidatoTareaUI[];
  usuarioActualId: string;
  esAdminOCoordinador: boolean;
  esResponsableDelTicket: boolean;
}

// Sub-ítems livianos dentro del ticket (ver análisis "Tareas dentro de un ticket") —
// cada fila abre su propio detalle con línea de tiempo y comentarios; `tareaAbiertaId`
// guarda solo el id (no una copia de la tarea), así que al refrescar la página tras una
// acción el modal sigue mostrando datos frescos derivados de `tareas` en cada render,
// en vez de quedarse con una instantánea vieja tomada al abrirlo.
export function TareasTicketPanel({ ticketId, tareas, candidatos, usuarioActualId, esAdminOCoordinador, esResponsableDelTicket }: Props) {
  const router = useRouter();
  const [tareaAbiertaId, setTareaAbiertaId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [tituloNuevo, setTituloNuevo] = useState("");
  const [asignadoNuevo, setAsignadoNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeCrear = esAdminOCoordinador || esResponsableDelTicket;
  const tareaAbierta = tareas.find((t) => t.id === tareaAbiertaId) ?? null;

  async function guardarTarea() {
    if (tituloNuevo.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres");
      return;
    }
    setError(null);
    setGuardando(true);
    const resultado = await crearTarea({
      ticketId,
      titulo: tituloNuevo.trim(),
      asignadoAId: asignadoNuevo || undefined,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setTituloNuevo("");
    setAsignadoNuevo("");
    setCreando(false);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Tareas</h2>
        {puedeCrear && !creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600"
          >
            + Agregar tarea
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {creando && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <input
            type="text"
            value={tituloNuevo}
            onChange={(e) => setTituloNuevo(e.target.value)}
            placeholder="Ej. Comprar licencia de Windows Server"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            autoFocus
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Asignar a (opcional)</label>
              <ComboboxBuscable
                value={asignadoNuevo}
                onChange={setAsignadoNuevo}
                placeholder="Sin asignar"
                options={[{ value: "", label: "Sin asignar" }, ...candidatos.map((c) => ({ value: c.id, label: c.nombre }))]}
              />
            </div>
            <Button type="button" disabled={guardando} onClick={guardarTarea}>
              {guardando ? "Creando..." : "Crear"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={guardando}
              onClick={() => {
                setCreando(false);
                setTituloNuevo("");
                setAsignadoNuevo("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {tareas.length === 0 && !creando && <p className="text-sm text-gray-400">Sin tareas registradas.</p>}

      {tareas.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {tareas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTareaAbiertaId(t.id)}
                className="flex w-full items-center gap-2 py-2 text-left hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1 break-words text-sm text-gray-800">{t.titulo}</span>
                {t.asignadoA && (
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {t.asignadoA.nombre}
                  </span>
                )}
                <EstadoTareaBadge estado={t.estado} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {tareaAbierta && (
        <TareaDetalleModal
          tarea={tareaAbierta}
          ticketId={ticketId}
          candidatos={candidatos}
          usuarioActualId={usuarioActualId}
          esAdminOCoordinador={esAdminOCoordinador}
          esResponsableDelTicket={esResponsableDelTicket}
          onClose={() => setTareaAbiertaId(null)}
        />
      )}
    </section>
  );
}
