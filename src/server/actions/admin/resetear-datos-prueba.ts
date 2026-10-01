"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { FRASE_CONFIRMACION_RESET } from "@/lib/utils/reset-datos-prueba";

const schema = z.object({ confirmacion: z.string() });

// Borra únicamente lo que se genera "probando" (tickets y todo lo que cuelga de ellos,
// notificaciones, conversaciones de chat, contactos pendientes, auditoría) — nunca
// Cliente/Sucursal/Activo/SistemaSoftware/Usuario, que son el catálogo real de la app.
// No restaura stockActual de repuestos ni borra archivos de storage (evidencias/firmas
// quedan huérfanas en disco) — fuera de alcance a propósito, ver conversación de diseño.
export async function resetearDatosPrueba(input: z.infer<typeof schema>) {
  if (process.env.ALLOW_DATA_RESET !== "true") {
    throw new Error("Esta acción está deshabilitada en este entorno.");
  }

  const usuario = await requireUsuario("ADMIN");

  const { confirmacion } = schema.parse(input);
  if (confirmacion !== FRASE_CONFIRMACION_RESET) {
    throw new Error("La frase de confirmación no coincide — no se borró nada.");
  }

  // Orden obligatorio por las FK en RESTRICT hacia tickets/conversaciones — borrar en
  // otro orden hace fallar la transacción entera en vez de borrar parcialmente.
  const resultado = await prisma.$transaction(async (tx) => {
    const mensajes = await tx.mensajeConversacion.deleteMany({});
    const notificaciones = await tx.notificacion.deleteMany({});
    const conversaciones = await tx.conversacionChat.deleteMany({});
    const historial = await tx.ticketHistorial.deleteMany({});
    const checklistRespuestas = await tx.ticketChecklistRespuesta.deleteMany({});
    const evidencias = await tx.evidencia.deleteMany({});
    const firmas = await tx.firmaDigital.deleteMany({});
    const repuestosTicket = await tx.ticketRepuesto.deleteMany({});
    const cotizaciones = await tx.cotizacion.deleteMany({});
    const contactosPendientes = await tx.contactoPendiente.deleteMany({});
    const tickets = await tx.ticket.deleteMany({});
    const auditoria = await tx.registroAuditoria.deleteMany({});

    return {
      tickets: tickets.count,
      historial: historial.count,
      checklistRespuestas: checklistRespuestas.count,
      evidencias: evidencias.count,
      firmas: firmas.count,
      repuestosTicket: repuestosTicket.count,
      cotizaciones: cotizaciones.count,
      notificaciones: notificaciones.count,
      conversaciones: conversaciones.count,
      mensajes: mensajes.count,
      contactosPendientes: contactosPendientes.count,
      auditoria: auditoria.count,
    };
  });

  // A propósito DESPUÉS del borrado (que vació registro_auditoria) — si se loggeara
  // antes, esta misma fila quedaría eliminada por la transacción de arriba.
  await registrarAuditoria({
    usuario,
    accion: "sistema.reset_datos_prueba",
    entidad: "Sistema",
    entidadId: "reset-datos-prueba",
    detalle: `Reseteó datos de prueba: ${resultado.tickets} tickets, ${resultado.notificaciones} notificaciones, ${resultado.conversaciones} conversaciones, ${resultado.contactosPendientes} contactos pendientes, ${resultado.auditoria} entradas de auditoría anteriores eliminadas.`,
  });

  return resultado;
}
