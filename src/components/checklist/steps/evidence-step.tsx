"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { WebcamCaptureModal } from "./webcam-capture-modal";
import type { EvidenciaPlana } from "@/types/ejecucion";

interface Props {
  ticketId: string;
  evidencias: EvidenciaPlana[];
  fotosMinimas: number;
  evidenciaNoAplica: boolean;
  motivoNoAplica: string | null;
  isPending: boolean;
  onEvidenciaSubida: (evidencia: EvidenciaPlana) => void;
  onMarcarNoAplica: (motivo: string) => void;
  onContinue: () => void;
}

export function EvidenceStep({
  ticketId,
  evidencias,
  fotosMinimas,
  evidenciaNoAplica,
  motivoNoAplica,
  isPending,
  onEvidenciaSubida,
  onMarcarNoAplica,
  onContinue,
}: Props) {
  const [uploading, setUploading] = useState<"FOTO_ANTES" | "FOTO_DESPUES" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFormNoAplica, setMostrarFormNoAplica] = useState(false);
  const [motivo, setMotivo] = useState("");
  const antesInputRef = useRef<HTMLInputElement>(null);
  const despuesInputRef = useRef<HTMLInputElement>(null);
  const antesGaleriaRef = useRef<HTMLInputElement>(null);
  const despuesGaleriaRef = useRef<HTMLInputElement>(null);

  const fotosAntes = evidencias.filter((e) => e.tipo === "FOTO_ANTES");
  const fotosDespues = evidencias.filter((e) => e.tipo === "FOTO_DESPUES");

  async function handleFile(tipo: "FOTO_ANTES" | "FOTO_DESPUES", file: File) {
    setError(null);
    setUploading(tipo);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tipo", tipo);
      const res = await fetch(`/api/tickets/${ticketId}/evidencias`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "No se pudo subir la foto");
      }
      const evidencia = (await res.json()) as EvidenciaPlana;
      onEvidenciaSubida(evidencia);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setUploading(null);
    }
  }

  const puedeContinuar = evidenciaNoAplica || (fotosAntes.length >= fotosMinimas && fotosDespues.length >= fotosMinimas);

  function confirmarNoAplica() {
    if (motivo.trim().length < 5) return;
    onMarcarNoAplica(motivo.trim());
    setMostrarFormNoAplica(false);
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">3. Evidencia Fotográfica</h2>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {evidenciaNoAplica && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Marcado como &quot;no requiere evidencia&quot;. Motivo: {motivoNoAplica}
          <br />
          <span className="text-xs">Si igual subes una foto abajo, esta marca se quita sola.</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <PhotoZone
          label={`Fotos antes (${fotosAntes.length}/${fotosMinimas} mín.)`}
          fotos={fotosAntes}
          uploading={uploading === "FOTO_ANTES"}
          inputRef={antesInputRef}
          galeriaRef={antesGaleriaRef}
          onSelect={(file) => handleFile("FOTO_ANTES", file)}
        />
        <PhotoZone
          label={`Fotos después (${fotosDespues.length}/${fotosMinimas} mín.)`}
          fotos={fotosDespues}
          uploading={uploading === "FOTO_DESPUES"}
          inputRef={despuesInputRef}
          galeriaRef={despuesGaleriaRef}
          onSelect={(file) => handleFile("FOTO_DESPUES", file)}
        />
      </div>

      {!evidenciaNoAplica && !puedeContinuar && (
        <div className="rounded-lg border border-gray-200 p-3">
          {mostrarFormNoAplica ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                ¿Por qué este ticket no necesita evidencia fotográfica?
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Se resolvió por teléfono guiando al usuario, no hubo intervención física."
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setMostrarFormNoAplica(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button type="button" disabled={isPending || motivo.trim().length < 5} onClick={confirmarNoAplica} className="flex-1">
                  Confirmar
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setMostrarFormNoAplica(true)} className="text-xs text-blue-600 underline">
              Este caso no requiere evidencia fotográfica
            </button>
          )}
        </div>
      )}

      <Button type="button" disabled={!puedeContinuar} onClick={onContinue} className="w-full">
        Continuar
      </Button>
    </section>
  );
}

function PhotoZone({
  label,
  fotos,
  uploading,
  inputRef,
  galeriaRef,
  onSelect,
}: {
  label: string;
  fotos: EvidenciaPlana[];
  uploading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  galeriaRef: RefObject<HTMLInputElement | null>;
  onSelect: (file: File) => void;
}) {
  // Se detecta en el cliente (nunca en el server render) para no desalinear el HTML
  // hidratado — getUserMedia no existe en el DOM virtual del servidor.
  const [webcamDisponible, setWebcamDisponible] = useState(false);
  const [mostrarWebcam, setMostrarWebcam] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setWebcamDisponible(Boolean(navigator.mediaDevices?.getUserMedia)));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {fotos.map((foto) => (
          <ImageThumbnail key={foto.id} src={foto.urlArchivo} alt="" className="aspect-square rounded-md object-cover" />
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-gray-300 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
        >
          {uploading ? "..." : "+ Cámara"}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" onClick={() => galeriaRef.current?.click()} className="text-xs text-blue-600 underline">
          Subir imagen (PNG/JPG)
        </button>
        {webcamDisponible && (
          <button type="button" onClick={() => setMostrarWebcam(true)} className="text-xs text-blue-600 underline">
            Usar cámara del navegador
          </button>
        )}
      </div>
      {/* "+ Cámara": en móvil, `capture` sugiere abrir la cámara directo — algunos
          navegadores igual ofrecen la galería en el mismo selector, pero no todos. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
      {/* "Subir imagen": SIN `capture`, para garantizar que siempre abra la galería/explorador
          de archivos y nunca fuerce la cámara — es la vía explícita para subir una foto ya
          existente en el teléfono (o cualquier imagen en desktop). */}
      <input
        ref={galeriaRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
      <WebcamCaptureModal open={mostrarWebcam} onClose={() => setMostrarWebcam(false)} onCapture={onSelect} />
    </div>
  );
}
