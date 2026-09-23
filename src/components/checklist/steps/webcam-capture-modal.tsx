"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

// Alternativa a "+ Cámara" (input[capture], que en desktop solo abre el explorador de
// archivos porque el atributo `capture` es una sugerencia que los navegadores de
// escritorio ignoran) — esta sí abre la webcam en vivo dentro del navegador, útil para
// probar el wizard desde una laptop sin tener que subir una imagen ya guardada.
export function WebcamCaptureModal({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError(null);
      setListo(false);
    });
    let cancelado = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setListo(true);
      })
      .catch(() => {
        setError("No se pudo acceder a la cámara. Revisa los permisos del navegador para este sitio.");
      });

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  function detener() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  function capturar() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `evidencia-${Date.now()}.jpg`, { type: "image/jpeg" }));
        detener();
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <Modal open={open} onClose={detener} title="Tomar foto con la cámara">
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- vista previa en vivo de la webcam, no un video con contenido */}
        <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full rounded-lg border border-gray-200 bg-black object-cover" />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={detener} className="flex-1">
            Cancelar
          </Button>
          <Button type="button" disabled={!listo} onClick={capturar} className="flex-1">
            Capturar foto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
