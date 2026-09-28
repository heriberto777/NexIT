import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { cumplioSla } from "@/lib/utils/sla";
import { calcularVigenciaPlan } from "@/lib/utils/plan-preventivo";
import { estadoTicketSchema, prioridadSchema } from "@/lib/zod/ticket.schema";

export const dynamic = "force-dynamic";

const ESTADOS_TERMINALES = new Set(["RESUELTO", "CERRADO", "CANCELADO"]);
const DIAS_CARGA_TECNICO = 30;

function fechaHaceNDias(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

// Sin verificación de identidad (a diferencia de /api/n8n/staff/verificar) — solo
// protegido por WEBHOOK_SECRET, para poder reusarlo tanto desde el workflow de
// consultas on-demand (después de pasar por /verificar) como desde el resumen diario
// programado, que no tiene un usuario de chat detrás. Misma data que /admin, calculada
// igual, para que el número que ve el coordinador por chat sea siempre el mismo que ve
// en el dashboard.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const hace30Dias = fechaHaceNDias(DIAS_CARGA_TECNICO);

  const [tickets, planes, config] = await Promise.all([
    prisma.ticket.findMany({
      select: {
        numeroTicket: true,
        titulo: true,
        estado: true,
        prioridad: true,
        fechaCreacion: true,
        fechaResolucion: true,
        tecnicoAsignadoId: true,
        cliente: { select: { nombre: true } },
        tecnicoAsignado: { select: { id: true, nombre: true } },
        sla: { select: { tiempoResolucionMin: true } },
      },
    }),
    prisma.planMantenimientoPreventivo.findMany({ where: { estado: "ACTIVO" }, select: { proximaFecha: true } }),
    obtenerConfiguracion(),
  ]);

  const defaultsHoras = slaHorasPorPrioridad(config);

  const ticketsPorEstado = Object.fromEntries(
    estadoTicketSchema.options.map((estado) => [estado, tickets.filter((t) => t.estado === estado).length]),
  );

  const ticketsActivos = tickets.filter((t) => !ESTADOS_TERMINALES.has(t.estado));
  const ticketsAbiertosPorPrioridad = Object.fromEntries(
    prioridadSchema.options.map((prioridad) => [prioridad, ticketsActivos.filter((t) => t.prioridad === prioridad).length]),
  );

  const resueltos = tickets.filter((t) => t.fechaResolucion !== null);
  const cumplidos = resueltos.filter((t) => cumplioSla(t, defaultsHoras) === true).length;
  const vencidos = resueltos.length - cumplidos;

  const tecnicosMap = new Map<string, { tecnico: string; activos: number; resueltosUltimos30Dias: number }>();
  for (const t of tickets) {
    if (!t.tecnicoAsignado) continue;
    const entry = tecnicosMap.get(t.tecnicoAsignado.id) ?? { tecnico: t.tecnicoAsignado.nombre, activos: 0, resueltosUltimos30Dias: 0 };
    if (!ESTADOS_TERMINALES.has(t.estado)) entry.activos += 1;
    if (t.fechaResolucion && t.fechaResolucion >= hace30Dias) entry.resueltosUltimos30Dias += 1;
    tecnicosMap.set(t.tecnicoAsignado.id, entry);
  }
  const cargaPorTecnico = [...tecnicosMap.values()]
    .filter((t) => t.activos > 0 || t.resueltosUltimos30Dias > 0)
    .sort((a, b) => b.activos - a.activos);

  const vigenciaLabel: Record<string, "vencido" | "proximo" | "programado"> = { vencido: "vencido", proximo: "proximo", programado: "programado" };
  const preventivosPorVigencia = { vencido: 0, proximo: 0, programado: 0 };
  for (const p of planes) {
    preventivosPorVigencia[vigenciaLabel[calcularVigenciaPlan(p.proximaFecha, config.diasVentanaProximoPreventivo)]] += 1;
  }

  const ahora = Date.now();
  const criticosSinAsignar = tickets
    .filter((t) => !t.tecnicoAsignadoId && !ESTADOS_TERMINALES.has(t.estado) && (t.prioridad === "CRITICA" || t.prioridad === "ALTA"))
    .map((t) => ({
      numeroTicket: t.numeroTicket,
      titulo: t.titulo,
      clienteNombre: t.cliente.nombre,
      prioridad: t.prioridad,
      horasAbierto: Math.round(((ahora - t.fechaCreacion.getTime()) / 3_600_000) * 10) / 10,
    }))
    .sort((a, b) => b.horasAbierto - a.horasAbierto);

  return NextResponse.json({
    ticketsActivos: ticketsActivos.length,
    ticketsPorEstado,
    ticketsAbiertosPorPrioridad,
    slaCumplimiento: { resueltos: resueltos.length, cumplidos, vencidos, pctCumplimiento: resueltos.length ? Math.round((cumplidos / resueltos.length) * 100) : null },
    cargaPorTecnico,
    preventivosPorVigencia,
    criticosSinAsignar,
  });
}
