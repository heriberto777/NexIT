import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { estadoTicketSchema, prioridadSchema } from "@/lib/zod/ticket.schema";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { SlaBadge } from "@/components/tickets/sla-badge";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { ESTADOS_CON_WIZARD_ACTIVO } from "@/lib/utils/ticket-estado";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ estado?: string; prioridad?: string; clienteId?: string }>;
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { dateStyle: "short" });

export default async function TicketsPage({ searchParams }: PageProps) {
  const sesion = await getSesionActual();
  const esTecnico = sesion?.rol === "TECNICO";

  const params = await searchParams;
  const estado = estadoTicketSchema.safeParse(params.estado).success ? params.estado : undefined;
  const prioridad = prioridadSchema.safeParse(params.prioridad).success ? params.prioridad : undefined;
  // El filtro de cliente no se ofrece al técnico (ver más abajo), así que tampoco se
  // respeta si llega por querystring — evita que "vea todo" armando la URL a mano.
  const clienteId = !esTecnico ? params.clienteId || undefined : undefined;

  const [tickets, clientes, config] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        estado: estado as never,
        prioridad: prioridad as never,
        clienteId,
        tecnicoAsignadoId: esTecnico ? sesion.id : undefined,
      },
      include: { cliente: true, sucursal: true, tecnicoAsignado: true, sla: true },
      orderBy: { fechaCreacion: "desc" },
    }),
    esTecnico ? Promise.resolve([]) : prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);

  const defaultsHoras = slaHorasPorPrioridad(config);
  const conSla = tickets.map((t) => ({ ...t, estadoSla: calcularEstadoSla(t, defaultsHoras) }));
  const kpis = {
    total: tickets.length,
    sinAsignar: tickets.filter((t) => !t.tecnicoAsignadoId).length,
    slaEnRiesgo: conSla.filter((t) => t.estadoSla === "en_riesgo").length,
    slaVencido: conSla.filter((t) => t.estadoSla === "vencido").length,
  };

  const hayFiltros = Boolean(estado || prioridad || clienteId);

  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-gray-50 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">{esTecnico ? "Mis tickets" : "Tickets"}</h1>

      <div className={`grid grid-cols-2 gap-3 ${esTecnico ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <KpiCard label="Total" value={kpis.total} />
        {!esTecnico && <KpiCard label="Sin asignar" value={kpis.sinAsignar} />}
        <KpiCard label="SLA en riesgo" value={kpis.slaEnRiesgo} tone="amber" />
        <KpiCard label="SLA vencido" value={kpis.slaVencido} tone="red" />
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {estadoTicketSchema.options.map((e) => (
              <option key={e} value={e}>
                {e.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Prioridad</label>
          <select name="prioridad" defaultValue={prioridad ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {prioridadSchema.options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {!esTecnico && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Cliente</label>
            <select name="clienteId" defaultValue={clienteId ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {hayFiltros && (
          <Link href="/tickets" className="text-sm text-gray-500 underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Cliente / Sede</th>
              <th className="px-3 py-2 font-medium">Prioridad</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">SLA</th>
              <th className="px-3 py-2 font-medium">Técnico</th>
              <th className="px-3 py-2 font-medium">Creado</th>
              {esTecnico && <th className="px-3 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {conSla.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/tickets/${t.id}`} className="font-medium text-blue-600 hover:underline">
                    #{t.numeroTicket}
                  </Link>
                  <p className="text-xs text-gray-500">{t.titulo}</p>
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {t.cliente.nombre}
                  <p className="text-xs text-gray-500">{t.sucursal.nombre}</p>
                </td>
                <td className="px-3 py-2">
                  <PrioridadBadge prioridad={t.prioridad} />
                </td>
                <td className="px-3 py-2">
                  <EstadoBadge estado={t.estado} />
                </td>
                <td className="px-3 py-2">
                  <SlaBadge estadoSla={t.estadoSla} />
                </td>
                <td className="px-3 py-2 text-gray-600">{t.tecnicoAsignado?.nombre ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500">{FORMATO_FECHA.format(t.fechaCreacion)}</td>
                {esTecnico && (
                  <td className="px-3 py-2 text-right">
                    {ESTADOS_CON_WIZARD_ACTIVO.has(t.estado) ? (
                      <Link
                        href={`/tickets/${t.id}/ejecucion`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Continuar atención
                      </Link>
                    ) : (
                      <Link href={`/tickets/${t.id}`} className="text-xs text-gray-500 underline">
                        Ver detalle
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={esTecnico ? 8 : 7} className="px-3 py-8 text-center text-sm text-gray-400">
                  {esTecnico ? "No tienes tickets asignados por ahora." : "No hay tickets que coincidan con los filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
