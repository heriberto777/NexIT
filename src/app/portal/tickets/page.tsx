import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { estadoTicketSchema } from "@/lib/zod/ticket.schema";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { SlaBadge } from "@/components/tickets/sla-badge";
import type { Prisma, EstadoTicket } from "@prisma/client";

export const dynamic = "force-dynamic";

const ESTADOS_ACTIVOS = ["ABIERTO", "ASIGNADO", "EN_DIAGNOSTICO", "ESPERANDO_REPUESTO", "EN_EJECUCION", "ESPERANDO_VALIDACION", "REABIERTO"] as const;
const ESTADOS_RESUELTOS = ["RESUELTO", "CERRADO"] as const;
const ESTADOS_DESCARGABLES = new Set(["RESUELTO", "CERRADO"]);

interface PageProps {
  searchParams: Promise<{ q?: string; sucursalId?: string; estado?: string }>;
}

export default async function PortalTicketsPage({ searchParams }: PageProps) {
  const sesion = await getSesionActual();
  const clienteId = sesion!.clienteId!;
  const params = await searchParams;
  const { q, sucursalId, estado } = params;

  let estadoWhere: Prisma.TicketWhereInput["estado"];
  if (estado === "activos") estadoWhere = { in: [...ESTADOS_ACTIVOS] };
  else if (estado === "resueltos") estadoWhere = { in: [...ESTADOS_RESUELTOS] };
  else if (estadoTicketSchema.safeParse(estado).success) estadoWhere = estado as EstadoTicket;

  const [tickets, sucursales, config] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        clienteId,
        sucursalId: sucursalId || undefined,
        estado: estadoWhere,
        OR: q
          ? [{ numeroTicket: { contains: q, mode: "insensitive" } }, { titulo: { contains: q, mode: "insensitive" } }]
          : undefined,
      },
      include: { sucursal: true, sla: true },
      orderBy: { fechaCreacion: "desc" },
    }),
    prisma.sucursal.findMany({ where: { clienteId }, orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);
  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "short" });
  const defaultsHoras = slaHorasPorPrioridad(config);

  const hayFiltros = Boolean(q || sucursalId || estado);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Mis tickets</h1>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Buscar</label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Código o asunto..."
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Sucursal</label>
          <select name="sucursalId" defaultValue={sucursalId ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="ESPERANDO_VALIDACION">En revisión</option>
            <option value="resueltos">Resueltos</option>
            <option value="REABIERTO">Reabiertos</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {hayFiltros && (
          <Link href="/portal/tickets" className="text-sm text-gray-500 underline">
            Limpiar
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <ul className="divide-y divide-gray-100">
          {tickets.map((t) => {
            const estadoSla = calcularEstadoSla(t, defaultsHoras);
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                <Link href={`/portal/tickets/${t.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    #{t.numeroTicket} — {t.titulo}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.sucursal.nombre} · {FORMATO_FECHA.format(t.fechaCreacion)}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <PrioridadBadge prioridad={t.prioridad} />
                  <EstadoBadge estado={t.estado} />
                  <SlaBadge estadoSla={estadoSla} />
                  {ESTADOS_DESCARGABLES.has(t.estado) && (
                    <a
                      href={`/api/tickets/${t.id}/pdf`}
                      className="text-xs text-blue-600 underline"
                      title="Descargar informe PDF"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </li>
            );
          })}
          {tickets.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">No hay tickets que coincidan.</li>}
        </ul>
      </div>
    </div>
  );
}
