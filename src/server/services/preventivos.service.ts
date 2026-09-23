import { prisma } from "@/lib/prisma";
import type { FrecuenciaMantenimiento } from "@prisma/client";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

function sumarFrecuencia(fecha: Date, frecuencia: FrecuenciaMantenimiento): Date {
  const resultado = new Date(fecha);
  switch (frecuencia) {
    case "SEMANAL":
      resultado.setDate(resultado.getDate() + 7);
      break;
    case "MENSUAL":
      resultado.setMonth(resultado.getMonth() + 1);
      break;
    case "TRIMESTRAL":
      resultado.setMonth(resultado.getMonth() + 3);
      break;
    case "SEMESTRAL":
      resultado.setMonth(resultado.getMonth() + 6);
      break;
    case "ANUAL":
      resultado.setFullYear(resultado.getFullYear() + 1);
      break;
  }
  return resultado;
}

// Si el job no corrió por varios períodos (ej. 3 trimestres sin ejecutarse), sumar la
// frecuencia UNA sola vez seguía dejando proximaFecha en el pasado — el plan aparecía
// "vencido" de nuevo en la siguiente corrida aunque ya se hubiera generado su ticket, y
// hacían falta N corridas manuales para ponerse al día. Esto NO genera N tickets — sigue
// generando uno solo por esta corrida — solo reprograma hasta la próxima fecha real.
function proximaFechaFutura(fecha: Date, frecuencia: FrecuenciaMantenimiento): Date {
  let siguiente = sumarFrecuencia(fecha, frecuencia);
  const ahora = new Date();
  while (siguiente <= ahora) {
    siguiente = sumarFrecuencia(siguiente, frecuencia);
  }
  return siguiente;
}

interface GenerarTicketsPreventivosParams {
  diasVentana?: number;
  usuarioId: string;
}

// Busca planes ACTIVOS cuya proximaFecha ya llegó (hoy o antes) o cae dentro de los
// próximos `diasVentana` días (por defecto, ConfiguracionSistema.diasAnticipacionPreventivos
// — configurable en /admin/configuracion), genera un ticket ASIGNADO por cada uno
// (clonando datos del plan, sin clonar ítems de checklist — esos se resuelven en la
// pantalla de ejecución por categoría del activo, igual que cualquier otro ticket) y
// reprograma proximaFecha sumando la frecuencia A PARTIR de la fecha que tocaba, no de
// "ahora", para que el calendario no vaya arrastrando atraso si el job corre tarde.
export async function generarTicketsPreventivos({ diasVentana, usuarioId }: GenerarTicketsPreventivosParams) {
  const ventana = diasVentana ?? (await obtenerConfiguracion()).diasAnticipacionPreventivos;

  const limite = new Date();
  limite.setDate(limite.getDate() + ventana);
  limite.setHours(23, 59, 59, 999);

  // El "reportador" de un ticket PROGRAMADO es el coordinador que corrió el job, no un
  // contacto del cliente — se busca una sola vez, fuera del loop, para no repetir la query.
  const coordinador = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });

  const planes = await prisma.planMantenimientoPreventivo.findMany({
    where: { estado: "ACTIVO", proximaFecha: { lte: limite } },
    include: {
      activo: { include: { sucursal: { include: { cliente: true } } } },
      sucursal: { include: { cliente: true } },
    },
  });

  const generados: { id: string; numeroTicket: string; planTitulo: string }[] = [];

  for (const plan of planes) {
    const cliente = plan.activo?.sucursal.cliente ?? plan.sucursal?.cliente;
    const sucursalId = plan.activo?.sucursalId ?? plan.sucursalId;
    if (!cliente || !sucursalId) continue; // dato inconsistente, se salta en vez de romper el lote
    const clienteId = cliente.id;

    const contratoSla = await prisma.contratoSla.findFirst({
      where: { prioridad: plan.prioridad, contrato: { clienteId, estado: "ACTIVO" } },
    });

    const numeroTicket = await siguienteNumeroTicket();

    const ticket = await prisma.$transaction(async (tx) => {
      const nuevoTicket = await tx.ticket.create({
        data: {
          numeroTicket,
          clienteId,
          sucursalId,
          activoId: plan.activoId,
          planPreventivoId: plan.id,
          tipo: "PREVENTIVO",
          categoriaSoporte: plan.activoId ? "HARDWARE" : "INFRAESTRUCTURA",
          prioridad: plan.prioridad,
          estado: "ASIGNADO",
          titulo: plan.titulo,
          descripcion: plan.descripcion ?? `Mantenimiento preventivo ${plan.frecuencia.toLowerCase()} generado automáticamente.`,
          creadoPorId: usuarioId,
          tecnicoAsignadoId: plan.tecnicoAsignadoId,
          slaId: contratoSla?.id,
          origen: "PROGRAMADO",
          fechaAsignacion: new Date(),
        },
      });

      await tx.ticketHistorial.create({
        data: {
          ticketId: nuevoTicket.id,
          usuarioId,
          estadoNuevo: "ASIGNADO",
          comentario: `Generado automáticamente desde el plan preventivo "${plan.titulo}"`,
        },
      });

      await tx.planMantenimientoPreventivo.update({
        where: { id: plan.id },
        data: {
          fechaUltimoMantenimiento: plan.proximaFecha,
          proximaFecha: proximaFechaFutura(plan.proximaFecha, plan.frecuencia),
        },
      });

      return nuevoTicket;
    });

    emitirEvento({
      tipo: "TICKET_CREADO",
      ticketId: ticket.id,
      numeroTicket: ticket.numeroTicket,
      clienteId,
      clienteNombre: cliente.nombre,
      titulo: ticket.titulo,
      prioridad: ticket.prioridad,
      origen: "PROGRAMADO",
      reportadoPorNombre: coordinador.nombre,
      reportadoPorEmail: coordinador.email,
    });

    generados.push({ id: ticket.id, numeroTicket: ticket.numeroTicket, planTitulo: plan.titulo });
  }

  return { generados };
}
