import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { storageService } from "@/server/services/storage.service";
import { tipoEvidenciaSchema } from "@/lib/zod/evidencia.schema";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

type RouteParams = { params: Promise<{ ticketId: string }> };

const ROLES_STAFF = ["TECNICO", "COORDINADOR", "ADMIN"];

export async function POST(request: NextRequest, { params }: RouteParams) {
  const usuario = await requireUsuario();
  const { ticketId } = await params;

  // El técnico sube evidencia de cualquier ticket que atienda; el cliente solo puede
  // adjuntar evidencia a SUS PROPIOS tickets (ej. fotos iniciales al reportar una falla).
  if (!ROLES_STAFF.includes(usuario.rol)) {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { clienteId: true } });
    if (usuario.rol !== "CLIENTE" || usuario.clienteId !== ticket.clienteId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const tipo = tipoEvidenciaSchema.parse(formData.get("tipo"));

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
  // Se persiste la KEY del storage (portable entre Local/S3), nunca la URL resuelta —
  // una presigned URL de S3 expira y dejaría el dato roto. La respuesta sí lleva la URL
  // ya resuelta para que el wizard pinte la miniatura de inmediato sin otra llamada.
  const { key, url } = await storageService.upload({
    buffer,
    contentType: file.type,
    pathPrefix: `tickets/${ticketId}/evidencias`,
  });

  const [evidencia] = await prisma.$transaction([
    prisma.evidencia.create({
      data: {
        ticketId,
        tipo,
        urlArchivo: key,
        usuarioId: usuario.id,
      },
    }),
    // Si el técnico había marcado "no aplica" y de todas formas sube una foto, el flag
    // queda desactualizado — una vez que SÍ hay evidencia real, no tiene sentido que el
    // ticket siga diciendo que no aplicaba.
    prisma.ticket.updateMany({
      where: { id: ticketId, evidenciaNoAplica: true },
      data: { evidenciaNoAplica: false, evidenciaNoAplicaMotivo: null },
    }),
  ]);

  return NextResponse.json({ ...evidencia, urlArchivo: url }, { status: 201 });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const usuario = await requireUsuario();
  const { ticketId } = await params;

  // Mismo criterio que el POST de este archivo: sin esto, cualquiera con sesión (o,
  // hasta hace poco, sin sesión siquiera) podía leer las evidencias de un ticket de
  // otra empresa con solo conocer el ticketId.
  if (!ROLES_STAFF.includes(usuario.rol)) {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { clienteId: true } });
    if (usuario.rol !== "CLIENTE" || usuario.clienteId !== ticket.clienteId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const evidencias = await prisma.evidencia.findMany({
    where: { ticketId },
    orderBy: { fechaCarga: "asc" },
  });
  const resueltas = await Promise.all(
    evidencias.map(async (e) => ({ ...e, urlArchivo: await storageService.getPublicUrl(e.urlArchivo) })),
  );
  return NextResponse.json(resueltas);
}
