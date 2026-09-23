"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";
import { crearTicketPortalSchema } from "@/lib/zod/portal.schema";
import type { CrearTicketPortalInput } from "@/lib/zod/portal.schema";

// El cliente solo reporta fallas (tipo siempre CORRECTIVO); instalaciones y preventivos
// los agenda el coordinador desde /admin. clienteId nunca viaja en el input — sale de la
// sesión, así un cliente no puede crear un ticket a nombre de otra empresa.
export async function crearTicketPortal(input: CrearTicketPortalInput) {
  const usuario = await requireUsuario("CLIENTE");
  if (!usuario.clienteId) {
    throw new Error("Tu usuario no está asociado a ninguna empresa");
  }

  const { sucursalId, activoId, ubicacionNoCatalogada, categoriaSoporte, titulo, descripcion, prioridadPercibida } =
    crearTicketPortalSchema.parse(input);

  const sucursal = await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
  if (sucursal.clienteId !== usuario.clienteId) {
    throw new Error("Esa sucursal no pertenece a tu empresa");
  }

  if (activoId) {
    const activo = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
    if (activo.sucursalId !== sucursalId) {
      throw new Error("Ese activo no pertenece a la sucursal seleccionada");
    }
  }

  const contrato = await prisma.contrato.findFirst({
    where: { clienteId: usuario.clienteId, estado: "ACTIVO" },
    orderBy: { fechaInicio: "desc" },
  });
  const sla = contrato
    ? await prisma.contratoSla.findFirst({ where: { contratoId: contrato.id, prioridad: prioridadPercibida } })
    : null;

  const descripcionFinal = ubicacionNoCatalogada
    ? `[Equipo/ubicación no catalogada: ${ubicacionNoCatalogada}]\n\n${descripcion}`
    : descripcion;

  const numeroTicket = await siguienteNumeroTicket();

  const ticket = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.ticket.create({
      data: {
        numeroTicket,
        clienteId: usuario.clienteId!,
        sucursalId,
        activoId,
        tipo: "CORRECTIVO",
        categoriaSoporte,
        prioridad: prioridadPercibida,
        estado: "ABIERTO",
        titulo,
        descripcion: descripcionFinal,
        creadoPorId: usuario.id,
        slaId: sla?.id,
        origen: "PORTAL",
      },
      include: { cliente: true },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: nuevo.id,
        usuarioId: usuario.id,
        estadoNuevo: "ABIERTO",
        comentario: "Ticket creado por el cliente desde el portal de auto-servicio",
      },
    });

    return nuevo;
  });

  emitirEvento({
    tipo: "TICKET_CREADO",
    ticketId: ticket.id,
    numeroTicket: ticket.numeroTicket,
    clienteId: ticket.clienteId,
    clienteNombre: ticket.cliente.nombre,
    titulo: ticket.titulo,
    prioridad: ticket.prioridad,
    origen: "PORTAL",
    reportadoPorNombre: usuario.nombre,
    reportadoPorEmail: usuario.email,
  });

  return { id: ticket.id, numeroTicket: ticket.numeroTicket };
}
