"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Check, Ban } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { EstadoTareaBadge } from "@/components/tickets/tareas/estado-tarea-badge";
import { SelectorAsignado } from "@/components/tickets/tareas/selector-asignado";
import { MentionTextarea, renderComentarioFormateado, type CandidatoMencion } from "@/components/tickets/tareas/mention-textarea";
import { cambiarEstadoTarea } from "@/server/actions/tickets/tareas/cambiar-estado-tarea";
import { reasignarTarea } from "@/server/actions/tickets/tareas/reasignar-tarea";
import { comentarTarea } from "@/server/actions/tickets/tareas/comentar-tarea";
import type { TareaUI, CandidatoTareaUI } from "@/components/tickets/tareas/types";

const ETIQUETA_ACTIVIDAD: Record<string, (a: TareaUI["actividad"][number]) => string> = {
  CREACION: (a) => `${a.usuarioNombre} creó la tarea`,
  CAMBIO_ESTADO: (a) => `${a.usuarioNombre} marcó la tarea como ${(a.estadoNuevo ?? "").replaceAll("_", " ").toLowerCase()}`,
  REASIGNACION: (a) => `${a.usuarioNombre} reasignó la tarea`,
  COMENTARIO: (a) => `${a.usuarioNombre} comentó:`,
};

interface Props {
  tarea: TareaUI;
  ticketId: string;
  candidatos: CandidatoTareaUI[];
  usuarioActualId: string;
  esAdminOCoordinador: boolean;
  esResponsableDelTicket: boolean;
  onClose: () => void;
}

export function TareaDetalleModal({
  tarea,
  ticketId,
  candidatos,
  usuarioActualId,
  esAdminOCoordinador,
  esResponsableDelTicket,
  onClose,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const [comentario, setComentario] = useState("");
  const [mencionados, setMencionados] = useState<CandidatoMencion[]>([]);
  const [fotoKey, setFotoKey] = useState<string | null>(null);
  const [fotoUrlPreview, setFotoUrlPreview] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const esAsignado = tarea.asignadoA?.id === usuarioActualId;
  const puedeGestionar = esAdminOCoordinador; // crear/reasignar — ver crear-tarea.ts (acá solo Admin/Coordinador o el responsable del ticket, ya filtrado por el panel padre)
  const puedeCambiarEstado = esAdminOCoordinador || esAsignado;
  const esTerminal = tarea.estado === "COMPLETADA" || tarea.estado === "CANCELADA";

  async function manejarCambioEstado(estado: "EN_PROGRESO" | "COMPLETADA" | "CANCELADA") {
    setError(null);
    setPendiente(true);
    const resultado = await cambiarEstadoTarea({ tareaId: tarea.id, estado });
    setPendiente(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  async function manejarReasignar(asignadoAId: string | null) {
    setError(null);
    setPendiente(true);
    const resultado = await reasignarTarea({ tareaId: tarea.id, asignadoAId });
    setPendiente(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  async function manejarSeleccionFoto(file: File) {
    setError(null);
    setSubiendoFoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tickets/${ticketId}/tareas/comentario-foto`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo subir la foto");
      }
      const { key, url } = (await res.json()) as { key: string; url: string };
      setFotoKey(key);
      setFotoUrlPreview(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function enviarComentario() {
    setError(null);
    setPendiente(true);
    const resultado = await comentarTarea({
      tareaId: tarea.id,
      comentario: comentario.trim() || undefined,
      fotoArchivo: fotoKey ?? undefined,
      mencionadosIds: mencionados.map((m) => m.id),
    });
    setPendiente(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setComentario("");
    setMencionados([]);
    setFotoKey(null);
    setFotoUrlPreview(null);
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={tarea.titulo} size="xl">
      <div className="max-h-[80vh] space-y-4 overflow-y-auto">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 break-words text-xs text-gray-500">
              {tarea.asignadoA ? (
                <>
                  Asignada a <b className="text-gray-700">{tarea.asignadoA.nombre}</b>
                </>
              ) : (
                "Sin asignar"
              )}
              {" · creada por "}
              {tarea.creadoPorNombre} · {tarea.fechaCreacion}
            </p>
            <EstadoTareaBadge estado={tarea.estado} />
          </div>
        </div>

        {puedeGestionar && !esTerminal && (
          <div className="border-t border-gray-100 pt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Reasignar a</label>
            <SelectorAsignado asignado={tarea.asignadoA} candidatos={candidatos} onChange={manejarReasignar} disabled={pendiente} />
          </div>
        )}

        {!esTerminal && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {tarea.estado === "PENDIENTE" && puedeCambiarEstado && (
              <Button
                type="button"
                variant="secondary"
                disabled={pendiente}
                onClick={() => manejarCambioEstado("EN_PROGRESO")}
                title="Marcar en progreso"
                aria-label="Marcar en progreso"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            {puedeCambiarEstado && (
              <Button
                type="button"
                variant="secondary"
                disabled={pendiente}
                onClick={() => manejarCambioEstado("COMPLETADA")}
                title="Marcar completada"
                aria-label="Marcar completada"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {(puedeGestionar || ((esAsignado || esResponsableDelTicket) && tarea.estado === "PENDIENTE")) && (
              <Button
                type="button"
                variant="danger"
                disabled={pendiente}
                onClick={() => manejarCambioEstado("CANCELADA")}
                title="Cancelar tarea"
                aria-label="Cancelar tarea"
              >
                <Ban className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Una sola columna en mobile (igual que antes: actividad arriba, escribir
            abajo); desde tablet (md:) se parte en dos — comentarios a la izquierda,
            composer a la derecha, lado a lado — como pidió el usuario. */}
        {/* items-start: por defecto CSS Grid estira ambas columnas a la misma altura
            (la de "Actividad", que crece con el historial) — eso hacía que el dropdown
            de menciones, posicionado debajo del textarea, apareciera muy lejos del
            cursor porque todo el bloque de la derecha quedaba estirado. Cada columna
            ahora mide solo lo que necesita su propio contenido. */}
        <div className="grid items-start gap-4 border-t border-gray-100 pt-3 md:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-gray-700">Actividad</p>
            <div className="space-y-3 border-l border-gray-200 pl-3">
              {tarea.actividad.map((a) => (
                <div key={a.id}>
                  <p className="text-[11px] text-gray-400">{a.fecha}</p>
                  <p className="break-words text-sm text-gray-800">{ETIQUETA_ACTIVIDAD[a.tipo]?.(a) ?? a.usuarioNombre}</p>
                  {a.tipo === "COMENTARIO" && a.comentario && (
                    <p className="mt-0.5 break-words text-sm text-gray-700">{renderComentarioFormateado(a.comentario, a.mencionesNombres)}</p>
                  )}
                  {a.fotoUrl && (
                    <div className="mt-1.5">
                      <ImageThumbnail src={a.fotoUrl} alt="Foto adjunta al comentario" className="h-20 w-20 rounded-md object-cover" />
                    </div>
                  )}
                </div>
              ))}
              {tarea.actividad.length === 0 && <p className="text-sm text-gray-400">Sin actividad todavía.</p>}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 border-t border-gray-100 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <MentionTextarea
              value={comentario}
              onChange={setComentario}
              candidatos={candidatos}
              mencionados={mencionados}
              onMencionadosChange={setMencionados}
              placeholder="Escribir un comentario... (@ para mencionar a alguien)"
              disabled={pendiente}
              rows={5}
            />
            {fotoUrlPreview && (
              <div className="flex items-center gap-2">
                <ImageThumbnail src={fotoUrlPreview} alt="Foto a adjuntar" className="h-14 w-14 rounded-md object-cover" />
                <button type="button" onClick={() => { setFotoKey(null); setFotoUrlPreview(null); }} className="text-xs text-red-600 underline">
                  Quitar foto
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="cursor-pointer whitespace-nowrap rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600">
                {subiendoFoto ? "Subiendo..." : "📎 Adjuntar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendoFoto || pendiente}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) manejarSeleccionFoto(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="flex-1" />
              <Button
                type="button"
                disabled={pendiente || subiendoFoto || (!comentario.trim() && !fotoKey)}
                onClick={enviarComentario}
              >
                {pendiente ? "Enviando..." : "Comentar"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
