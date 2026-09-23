import { NextRequest, NextResponse } from "next/server";
import { storageService } from "@/server/services/storage.service";

export const dynamic = "force-dynamic";

// Sirve los archivos de LocalStorageProvider vía Route Handler (lee el disco en cada
// request) en vez de por public/uploads directo — el servidor standalone de Next.js
// resuelve qué archivos existen bajo public/ al arrancar, así que un archivo escrito
// DESPUÉS de que el contenedor ya está corriendo (exactamente el caso de una foto de
// evidencia subida por un técnico) devolvía 404 hasta el próximo reinicio, aunque el
// archivo ya estuviera bien escrito en disco. Un Route Handler no tiene ese problema:
// siempre ejecuta el código y lee el filesystem en el momento del request.
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function contentTypePara(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const key = path.join("/");

  try {
    const buffer = await storageService.getBuffer(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypePara(key),
        // Inmutable: cada key es un UUID generado una sola vez, nunca se sobrescribe.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
}
