import { NextResponse } from "next/server";
import type { EstadoTicket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSecretoWebhook } from "@/server/auth/webhook-secret";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { obtenerResumenStaff } from "@/server/services/resumen-staff.service";

export const dynamic = "force-dynamic";

const ESTADOS_TERMINALES: EstadoTicket[] = ["RESUELTO", "CERRADO", "CANCELADO"];
const DIAS_PREVENTIVOS_PROXIMOS = 7;

// Fuente del "resumen diario" programado (Workflow 7): a diferencia de
// /api/n8n/staff/resumen (un solo snapshot agregado, para un chat grupal), esto arma
// UN payload por persona vinculada — cada técnico ve sus propios tickets/preventivos,
// cada Admin/Coordinador ve el mismo agregado de siempre pero entregado a su propio
// chat en vez de a un grupo compartido. n8n recorre ambos arrays y le manda a cada
// quien su propio mensaje.
export async function GET(request: Request) {
  const noAutorizado = await verificarSecretoWebhook(request);
  if (noAutorizado) return noAutorizado;

  const [tecnicosVinculados, staffVinculado, config] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: "TECNICO", estado: "ACTIVO", OR: [{ telegramChatId: { not: null } }, { whatsappTelefono: { not: null } }] },
    }),
    prisma.usuario.findMany({
      where: { rol: { in: ["ADMIN", "COORDINADOR"] }, estado: "ACTIVO", OR: [{ telegramChatId: { not: null } }, { whatsappTelefono: { not: null } }] },
    }),
    obtenerConfiguracion(),
  ]);

  const defaultsHoras = slaHorasPorPrioridad(config);
  const limitePreventivos = new Date();
  limitePreventivos.setDate(limitePreventivos.getDate() + DIAS_PREVENTIVOS_PROXIMOS);

  const tecnicos = await Promise.all(
    tecnicosVinculados.map(async (usuario) => {
      const [tickets, preventivos] = await Promise.all([
        prisma.ticket.findMany({
          where: { tecnicoAsignadoId: usuario.id, estado: { notIn: ESTADOS_TERMINALES } },
          include: { cliente: true, sla: { select: { tiempoResolucionMin: true } } },
          orderBy: { fechaCreacion: "asc" },
        }),
        prisma.planMantenimientoPreventivo.findMany({
          where: { tecnicoAsignadoId: usuario.id, estado: "ACTIVO", proximaFecha: { lte: limitePreventivos } },
          include: { activo: { include: { sucursal: { include: { cliente: true } } } }, sucursal: { include: { cliente: true } } },
          orderBy: { proximaFecha: "asc" },
        }),
      ]);

      return {
        usuarioNombre: usuario.nombre,
        telegramChatId: usuario.telegramChatId,
        whatsappTelefono: usuario.whatsappTelefono,
        ticketsHoy: tickets.map((t) => ({
          numeroTicket: t.numeroTicket,
          titulo: t.titulo,
          clienteNombre: t.cliente.nombre,
          prioridad: t.prioridad,
          estado: t.estado,
          estadoSla: calcularEstadoSla(t, defaultsHoras),
        })),
        preventivosProximos: preventivos.map((p) => ({
          titulo: p.titulo,
          clienteNombre: (p.activo?.sucursal.cliente ?? p.sucursal?.cliente)?.nombre ?? "—",
          proximaFecha: p.proximaFecha.toISOString().slice(0, 10),
        })),
      };
    }),
  );

  const resumenAgregado = await obtenerResumenStaff();
  const staff = staffVinculado.map((usuario) => ({
    usuarioNombre: usuario.nombre,
    rol: usuario.rol,
    telegramChatId: usuario.telegramChatId,
    whatsappTelefono: usuario.whatsappTelefono,
    resumen: resumenAgregado,
  }));

  return NextResponse.json({ tecnicos, staff, empresaNombre: config.empresaNombre });
}
