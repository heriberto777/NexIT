"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { storageService } from "@/server/services/storage.service";
import { capturarFirmaSchema } from "@/lib/zod/firma.schema";
import type { CapturarFirmaInput } from "@/lib/zod/firma.schema";

// Paso 5: sube la firma capturada en el canvas y la asocia al ticket con trazabilidad
// (quién firmó, desde qué IP, cuándo).
export async function capturarFirma(input: CapturarFirmaInput) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId, nombreFirmante, cargoFirmante, firmaBase64 } = capturarFirmaSchema.parse(input);

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    throw new Error("Este ticket no está asignado a este técnico");
  }

  const base64Data = firmaBase64.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Se persiste la KEY del storage, no una URL resuelta (ver storage.service.ts) —
  // el detalle del ticket y el PDF la resuelven a URL/bytes cuando la necesitan.
  const { key } = await storageService.upload({
    buffer,
    contentType: "image/png",
    pathPrefix: `tickets/${ticketId}/firmas`,
  });

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for") ?? undefined;

  const firma = await prisma.firmaDigital.create({
    data: {
      ticketId,
      nombreFirmante,
      cargoFirmante,
      urlFirmaImagen: key,
      ipDispositivo: ip,
    },
  });

  return { id: firma.id };
}
