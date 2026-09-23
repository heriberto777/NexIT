import { prisma } from "@/lib/prisma";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { emitirEvento } from "@/server/services/webhook.service";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";

// Pensado para invocarse periódicamente desde un cron EXTERNO (crontab del host o el
// scheduler propio de n8n) contra /api/cron/sla-check — Next.js no trae un scheduler
// interno, así que no hay forma de detectar "el ticket X acaba de entrar en riesgo" en
// el momento exacto. Cada corrida reevalúa todos los tickets abiertos con SLA asignado;
// uno que sigue en riesgo genera un nuevo evento en cada corrida (recordatorio), no solo
// la primera vez — deduplicar en n8n (por ticketId + fecha) si el flujo no debe repetir avisos.
export async function revisarTicketsEnRiesgo() {
  const [tickets, config] = await Promise.all([
    // Antes filtraba `slaId: { not: null }` — dejaba fuera cualquier ticket sin
    // contrato, que ahora sí puede estar en riesgo/vencido contra el default global.
    prisma.ticket.findMany({
      where: { estado: { notIn: ["RESUELTO", "CERRADO", "CANCELADO"] } },
      include: { sla: true, cliente: true, tecnicoAsignado: true },
    }),
    obtenerConfiguracion(),
  ]);
  const defaultsHoras = slaHorasPorPrioridad(config);

  let notificados = 0;
  for (const ticket of tickets) {
    const estadoSla = calcularEstadoSla(ticket, defaultsHoras);
    if (estadoSla !== "en_riesgo" && estadoSla !== "vencido") continue;

    const tiempoResolucionMin = ticket.sla?.tiempoResolucionMin ?? defaultsHoras[ticket.prioridad] * 60;
    const minutosRestantes = Math.round(tiempoResolucionMin - (Date.now() - ticket.fechaCreacion.getTime()) / 60_000);

    emitirEvento({
      tipo: "SLA_EN_RIESGO",
      ticketId: ticket.id,
      numeroTicket: ticket.numeroTicket,
      clienteNombre: ticket.cliente.nombre,
      titulo: ticket.titulo,
      prioridad: ticket.prioridad,
      tecnicoAsignadoNombre: ticket.tecnicoAsignado?.nombre ?? null,
      estadoSla,
      minutosRestantes,
    });
    notificados++;
  }

  return { revisados: tickets.length, notificados };
}
