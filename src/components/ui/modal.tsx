"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // "md" (default, sin cambios) para formularios de pocos campos; "lg" para modales con
  // más contenido (vista previa de cámara); "xl" para layouts de dos columnas (detalle
  // de tarea) — ancho fluido en vez de un breakpoint fijo, igual criterio que
  // PageContainer: crece en pantallas grandes sin perder el gutter en mobile/tablet.
  size?: "md" | "lg" | "xl";
}

const TAMANOS = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-[min(64rem,92vw)]" } as const;

export function Modal({ open, onClose, title, children, size = "md" }: Props) {
  // Si el click (mousedown) que abre la selección de texto empieza DENTRO del modal
  // (ej. arrastrar para seleccionar un comentario largo) y el mouse termina soltándose
  // sobre el fondo, el navegador igual dispara un "click" ahí — un simple onClick en el
  // fondo cerraba el modal por accidente en ese caso. Por eso closeHabilitado solo queda
  // en true cuando el propio mousedown también empezó en el fondo, no solo el click.
  const closeHabilitado = useRef(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        closeHabilitado.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closeHabilitado.current && e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className={cn("w-full rounded-xl bg-white p-4 shadow-xl", TAMANOS[size])}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
