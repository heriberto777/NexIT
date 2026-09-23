"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";
import { crearTicketSchema } from "@/lib/zod/ticket.schema";
import type { CrearTicketInput } from "@/lib/zod/ticket.schema";

const ROLES_PERMITIDOS = ["ADMIN", "COORDINADOR", "TECNICO"] as const;

// Creación manual por staff — el caso principal es "el cliente llamó por teléfono en
// vez de entrar al portal". A diferencia de crearTicketPortal (que fija tipo=CORRECTIVO
// y saca clienteId de la sesión), aquí el staff elige el cliente y cualquiera de los 3
// tipos de ticket.
export async function crearTicket(input: CrearTicketInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede crear tickets`);
  }

  const {
    clienteId,
    sucursalId,
    activoId,
    ubicacionNoCatalogada,
    tipo,
    categoriaSoporte,
    titulo,
    descripcion,
    prioridad,
    contactoNombre,
    contactoTelefono,
  } = crearTicketSchema.parse(input);

  const sucursal = await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
  if (sucursal.clienteId !== clienteId) {
    throw new Error("Esa sucursal no pertenece al cliente seleccionado");
  }

  if (activoId) {
    const activo = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
    if (activo.sucursalId !== sucursalId) {
      throw new Error("Ese activo no pertenece a la sucursal seleccionada");
    }
  }

  const contrato = await prisma.contrato.findFirst({
    where: { clienteId, estado: "ACTIVO" },
    orderBy: { fechaInicio: "desc" },
  });
  const sla = contrato
    ? await prisma.contratoSla.findFirst({ where: { contratoId: contrato.id, prioridad } })
    : null;

  // El contacto telefónico no tiene columna propia en Ticket — se deja al inicio de la
  // descripción, igual que ubicacionNoCatalogada en el flujo del portal, para que quede
  // visible en el detalle del ticket y en el PDF sin necesitar una migración nueva.
  const descripcionFinal = [
    `[Reportado por teléfono — contacto: ${contactoNombre}, ${contactoTelefono}]`,
    ubicacionNoCatalogada ? `[Equipo/ubicación no catalogada: ${ubicacionNoCatalogada}]` : null,
    descripcion,
  ]
    .filter(Boolean)
    .join("\n\n");

  const numeroTicket = await siguienteNumeroTicket();

  const ticket = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.ticket.create({
      data: {
        numeroTicket,
        clienteId,
        sucursalId,
        activoId,
        tipo,
        categoriaSoporte,
        prioridad,
        estado: "ABIERTO",
        titulo,
        descripcion: descripcionFinal,
        creadoPorId: usuario.id,
        slaId: sla?.id,
        origen: "TELEFONO",
      },
      include: { cliente: true },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: nuevo.id,
        usuarioId: usuario.id,
        estadoNuevo: "ABIERTO",
        comentario: `Ticket creado por ${usuario.nombre} (${usuario.rol}) — reportado por teléfono`,
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
    origen: "TELEFONO",
    reportadoPorNombre: usuario.nombre,
    reportadoPorEmail: usuario.email,
  });

  return { id: ticket.id, numeroTicket: ticket.numeroTicket };
}
