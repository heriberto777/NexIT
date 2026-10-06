import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { storageService } from "@/server/services/storage.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { tieneAccesoAlTicket, INCLUDE_COLABORADORES } from "@/server/services/ticket-acceso.service";

type RouteParams = { params: Promise<{ ticketId: string }> };

// Sube UNA foto para adjuntar a un comentario de una tarea (no crea el comentario —
// eso lo hace comentar-tarea.ts al enviar el formulario; esta ruta solo sube el archivo
// y devuelve la key, igual patrón que /api/tickets/[ticketId]/checklist-foto).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const usuario = await requireUsuario();
  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { tecnicoAsignadoId: true, ...INCLUDE_COLABORADORES },
  });
  const puedeSubir = usuario.rol === "ADMIN" || usuario.rol === "COORDINADOR" || tieneAccesoAlTicket(ticket, usuario.id);
  if (!puedeSubir) {
    return NextResponse.json({ error: "No tienes acceso a este ticket" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  const { evidenciaMaxMB } = await obtenerConfiguracion();
  if (file.size > evidenciaMaxMB * 1024 * 1024) {
    return NextResponse.json({ error: `La foto excede ${evidenciaMaxMB}MB` }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se aceptan imágenes" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { key, url } = await storageService.upload({
    buffer,
    contentType: file.type,
    pathPrefix: `tickets/${ticketId}/tareas`,
  });

  return NextResponse.json({ key, url }, { status: 201 });
}
