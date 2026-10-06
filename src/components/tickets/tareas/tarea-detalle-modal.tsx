"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { EstadoTareaBadge } from "@/components/tickets/tareas/estado-tarea-badge";
import { MentionTextarea, renderComentarioConMenciones, type CandidatoMencion } from "@/components/tickets/tareas/mention-textarea";
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

  async function manejarReasignar(asignadoAId: string) {
    setError(null);
    setPendiente(true);
    const resultado = await reasignarTarea({ tareaId: tarea.id, asignadoAId: asignadoAId || null });
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
    <Modal open onClose={onClose} title={tarea.titulo}>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto">
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
          <div className="flex items-end gap-2 border-t border-gray-100 pt-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Reasignar a</label>
              <ComboboxBuscable
                value={tarea.asignadoA?.id ?? ""}
                onChange={manejarReasignar}
                placeholder="Sin asignar"
                options={[{ value: "", label: "Sin asignar" }, ...candidatos.map((c) => ({ value: c.id, label: c.nombre }))]}
                disabled={pendiente}
              />
            </div>
          </div>
        )}

        {!esTerminal && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {tarea.estado === "PENDIENTE" && puedeCambiarEstado && (
              <Button type="button" variant="secondary" disabled={pendiente} onClick={() => manejarCambioEstado("EN_PROGRESO")}>
                Marcar en progreso
              </Button>
            )}
            {puedeCambiarEstado && (
              <Button type="button" variant="secondary" disabled={pendiente} onClick={() => manejarCambioEstado("COMPLETADA")}>
                Marcar completada
              </Button>
            )}
            {(puedeGestionar || ((esAsignado || esResponsableDelTicket) && tarea.estado === "PENDIENTE")) && (
              <Button type="button" variant="danger" disabled={pendiente} onClick={() => manejarCambioEstado("CANCELADA")}>
                Cancelar tarea
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-700">Actividad</p>
          <div className="space-y-3 border-l border-gray-200 pl-3">
            {tarea.actividad.map((a) => (
              <div key={a.id}>
                <p className="text-[11px] text-gray-400">{a.fecha}</p>
                <p className="break-words text-sm text-gray-800">{ETIQUETA_ACTIVIDAD[a.tipo]?.(a) ?? a.usuarioNombre}</p>
                {a.tipo === "COMENTARIO" && a.comentario && (
                  <p className="mt-0.5 break-words text-sm text-gray-700">{renderComentarioConMenciones(a.comentario, a.mencionesNombres)}</p>
                )}
                {a.fotoUrl && (
                  <div className="mt-1.5">
                    <ImageThumbnail src={a.fotoUrl} alt="Foto adjunta al comentario" className="h-20 w-20 rounded-md object-cover" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-3">
          <MentionTextarea
            value={comentario}
            onChange={setComentario}
            candidatos={candidatos}
            mencionados={mencionados}
            onMencionadosChange={setMencionados}
            placeholder="Escribir un comentario... (@ para mencionar a alguien)"
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
    </Modal>
  );
}
