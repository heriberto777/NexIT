"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { emitirEvento } from "@/server/services/webhook.service";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";
import { tieneAccesoAlTicket, INCLUDE_COLABORADORES } from "@/server/services/ticket-acceso.service";
import { ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";

const iniciarAtencionSchema = z.object({
  ticketId: z.string().cuid(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
});

// Paso 1: check-in del técnico en el sitio. Pasa el ticket a EN_DIAGNOSTICO.
export async function iniciarAtencion(
  input: z.infer<typeof iniciarAtencionSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof prisma.ticket.update>>>> {
  return ejecutarAccion(async () => {
    // Sin restricción de rol acá: un Admin/Coordinador puede estar asignado como
    // "técnico" de este ticket (ver asignar-tecnico.ts) y ejecutar el wizard él mismo —
    // la propiedad (el chequeo de abajo), no el rol, es lo que habilita cada paso.
    const usuario = await requireUsuario();
    const { ticketId } = iniciarAtencionSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { cliente: true, creadoPor: true, ...INCLUDE_COLABORADORES },
    });
    if (!tieneAccesoAlTicket(ticket, usuario.id)) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      // `fechaInicioAtencion: null` es la misma condición que ya usa calcularPasoInicial
      // en execution-wizard.tsx para decidir si mostrar "Iniciar Atención" — reusarla acá
      // como guardia atómica evita duplicar el check-in (doble clic) y, junto con el
      // estado no terminal, evita revivir un ticket cancelado/cerrado concurrentemente.
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, fechaInicioAtencion: null, estado: { notIn: Array.from(ESTADOS_TERMINALES) } },
        data: { estado: "EN_DIAGNOSTICO", fechaInicioAtencion: new Date() },
      });
      if (count === 0) {
        throw new Error("El ticket ya tiene un check-in registrado o cambió de estado — recargá la página");
      }
      const ticketActualizado = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });

      await tx.ticketHistorial.create({
        data: {
          ticketId,
          usuarioId: usuario.id,
          estadoAnterior: ticket.estado,
          estadoNuevo: "EN_DIAGNOSTICO",
          comentario: "Check-in del técnico en sitio",
        },
      });

      return ticketActualizado;
    });

    // Fuera de la transacción a propósito: si el webhook fallara, no debe revertir el
    // cambio de estado ya confirmado en la base de datos.
    emitirEvento({
      tipo: "TICKET_CAMBIO_ESTADO",
      ticketId,
      numeroTicket: actualizado.numeroTicket,
      clienteNombre: ticket.cliente.nombre,
      estadoAnterior: ticket.estado,
      estadoNuevo: "EN_DIAGNOSTICO",
      reportadoPorNombre: ticket.creadoPor.nombre,
      reportadoPorEmail: ticket.creadoPor.email,
      reportadoPorTelegramChatId: ticket.creadoPor.telegramChatId,
      reportadoPorWhatsapp: ticket.creadoPor.whatsappTelefono,
    });

    return actualizado;
  });
}
