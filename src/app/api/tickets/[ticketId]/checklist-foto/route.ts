import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { storageService } from "@/server/services/storage.service";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB por foto

type RouteParams = { params: Promise<{ ticketId: string }> };

// Sube UNA foto asociada a un ítem puntual del checklist (no crea el registro de
// TicketChecklistRespuesta — eso lo hace guardar-checklist.ts al enviar el formulario
// completo; esta ruta solo sube el archivo y devuelve la key para incluir en ese envío,
// igual patrón que /api/tickets/[ticketId]/evidencias).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const usuario = await requireUsuario("TECNICO");
  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { tecnicoAsignadoId: true } });
  if (ticket.tecnicoAsignadoId !== usuario.id) {
    return NextResponse.json({ error: "Este ticket no está asignado a este técnico" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La foto excede 8MB" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se aceptan imágenes" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { key, url } = await storageService.upload({
    buffer,
    contentType: file.type,
    pathPrefix: `tickets/${ticketId}/checklist`,
  });

  return NextResponse.json({ key, url }, { status: 201 });
}
