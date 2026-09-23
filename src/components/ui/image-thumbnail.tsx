"use client";

import { useState } from "react";

interface Props {
  src: string;
  alt: string;
  className?: string;
}

// Miniatura clicable: abre la imagen a tamaño completo en un overlay, sin depender del
// componente Modal genérico (pensado para formularios, no para fotos a pantalla completa).
export function ImageThumbnail({ src, alt, className }: Props) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="block w-full cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element -- evidencia subida por el usuario */}
        <img src={src} alt={alt} className={className} />
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAbierta(false)}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="absolute right-4 top-4 text-3xl leading-none text-white/80 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- evidencia subida por el usuario */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
