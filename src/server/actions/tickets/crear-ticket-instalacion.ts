"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarTicketSinAsignar } from "@/server/services/notificacion.service";
import { crearTicketInstalacionSchema } from "@/lib/zod/ticket.schema";
import type { CrearTicketInstalacionInput } from "@/lib/zod/ticket.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

// Genera un ticket de instalación/entrega de seguimiento a partir de una cotización de
// producto ya aprobada por el cliente — ver análisis "cómo ve Admin/Coordinador esto
// para cobrarle al cliente". No reemplaza crear-ticket.ts (creación manual por
// teléfono): acá ya se conocen cliente/sucursal/activo, salen del ticket de origen.
export async function crearTicketInstalacion(
  input: CrearTicketInstalacionInput,
): Promise<ActionResult<{ id: string; numeroTicket: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede generar tickets de instalación`);
    }

    const { cotizacionId } = crearTicketInstalacionSchema.parse(input);

    const cotizacion = await prisma.cotizacion.findUniqueOrThrow({
      where: { id: cotizacionId },
      include: { ticket: { include: { cliente: true } }, repuesto: true },
    });

    if (!cotizacion.repuestoId || !cotizacion.repuesto) {
      throw new Error("Esta cotización no es de un producto del catálogo");
    }
    if (cotizacion.estado !== "APROBADO") {
      throw new Error("La cotización todavía no está aprobada por el cliente");
    }
    if (cotizacion.ticketInstalacionId) {
      throw new Error("Ya existe un ticket de instalación para esta cotización");
    }

    const ticketOrigen = cotizacion.ticket;

    const contrato = await prisma.contrato.findFirst({
      where: { clienteId: ticketOrigen.clienteId, estado: "ACTIVO" },
      orderBy: { fechaInicio: "desc" },
    });
    const sla = contrato
      ? await prisma.contratoSla.findFirst({ where: { contratoId: contrato.id, prioridad: "MEDIA" } })
      : null;

    const numeroTicket = await siguienteNumeroTicket();
    const titulo = `Instalación: ${cotizacion.repuesto.nombre}`;
    const descripcion = `Ticket generado automáticamente para instalar/entregar "${cotizacion.repuesto.nombre}"${
      cotizacion.cantidad ? ` x${cotizacion.cantidad}` : ""
    }, cotizado y aprobado en el ticket ${ticketOrigen.numeroTicket}.`;

    const ticket = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.ticket.create({
        data: {
          numeroTicket,
          clienteId: ticketOrigen.clienteId,
          sucursalId: ticketOrigen.sucursalId,
          activoId: ticketOrigen.activoId,
          tipo: "INSTALACION",
          categoriaSoporte: "HARDWARE",
          prioridad: "MEDIA",
          estado: "ABIERTO",
          titulo,
          descripcion,
          creadoPorId: usuario.id,
          slaId: sla?.id,
          origen: "SEGUIMIENTO",
        },
        include: { cliente: true },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId: nuevo.id,
          usuarioId: usuario.id,
          estadoNuevo: "ABIERTO",
          comentario: `Ticket creado por ${usuario.nombre} (${usuario.rol}) a partir de la cotización aprobada en el ticket ${ticketOrigen.numeroTicket}`,
        },
      });

      await tx.cotizacion.update({ where: { id: cotizacion.id }, data: { ticketInstalacionId: nuevo.id } });

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
      origen: "SEGUIMIENTO",
      reportadoPorNombre: usuario.nombre,
      reportadoPorEmail: usuario.email,
      reportadoPorTelegramChatId: null,
      reportadoPorWhatsapp: null,
    });

    await notificarTicketSinAsignar(ticket, titulo);

    return { id: ticket.id, numeroTicket: ticket.numeroTicket };
  });
}
