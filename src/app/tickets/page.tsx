import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { estadoTicketSchema, prioridadSchema } from "@/lib/zod/ticket.schema";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { SlaBadge } from "@/components/tickets/sla-badge";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { ESTADOS_CON_WIZARD_ACTIVO, ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { TableScroll } from "@/components/ui/table-scroll";
import { TicketCard } from "@/components/tickets/ticket-card";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ estado?: string; prioridad?: string; clienteId?: string; asignadoAMi?: string }>;
}

export default async function TicketsPage({ searchParams }: PageProps) {
  const sesion = await getSesionActual();
  const esTecnico = sesion?.rol === "TECNICO";

  const params = await searchParams;
  const estado = estadoTicketSchema.safeParse(params.estado).success ? params.estado : undefined;
  const prioridad = prioridadSchema.safeParse(params.prioridad).success ? params.prioridad : undefined;
  // El filtro de cliente no se ofrece al técnico (ver más abajo), así que tampoco se
  // respeta si llega por querystring — evita que "vea todo" armando la URL a mano.
  const clienteId = !esTecnico ? params.clienteId || undefined : undefined;
  // Ahora que un Admin/Coordinador también puede terminar como tecnicoAsignadoId de un
  // ticket (ver asignar-tecnico.ts), este filtro les da un atajo a "lo mío" sin perder
  // la vista general que siguen teniendo por defecto. El técnico ya ve solo lo suyo, así
  // que para él este parámetro no aplica.
  const asignadoAMi = !esTecnico && params.asignadoAMi === "1";

  const whereBase = { estado: estado as never, prioridad: prioridad as never, clienteId };

  const [tickets, asignadosAMiCount, clientes, config] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...whereBase,
        tecnicoAsignadoId: esTecnico ? sesion.id : asignadoAMi ? sesion!.id : undefined,
      },
      include: { cliente: true, sucursal: true, tecnicoAsignado: true, sla: true },
      orderBy: { fechaCreacion: "desc" },
    }),
    !esTecnico && sesion ? prisma.ticket.count({ where: { ...whereBase, tecnicoAsignadoId: sesion.id } }) : Promise.resolve(0),
    esTecnico ? Promise.resolve([]) : prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);

  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "short" });
  const defaultsHoras = slaHorasPorPrioridad(config);
  const conSla = tickets.map((t) => ({ ...t, estadoSla: calcularEstadoSla(t, defaultsHoras) }));
  // "Total" refleja todo lo que coincide con los filtros (igual que la tabla de abajo,
  // incluidos cancelados/resueltos/cerrados). "Activos" excluye esos estados terminales
  // para que no se confunda con "trabajo pendiente" — antes "Sin asignar" tampoco
  // excluía terminales, así que un ticket CANCELADO sin técnico contaba como si
  // necesitara asignación.
  const activos = tickets.filter((t) => !ESTADOS_TERMINALES.has(t.estado));
  const kpis = {
    total: tickets.length,
    activos: activos.length,
    sinAsignar: activos.filter((t) => !t.tecnicoAsignadoId).length,
    asignadosAMi: asignadosAMiCount,
    slaEnRiesgo: conSla.filter((t) => t.estadoSla === "en_riesgo").length,
    slaVencido: conSla.filter((t) => t.estadoSla === "vencido").length,
  };

  const hayFiltros = Boolean(estado || prioridad || clienteId || asignadoAMi);

  // La columna de acción aparece para el técnico (siempre ve solo lo suyo) y también
  // para un Admin/Coordinador que tenga al menos un ticket de esta lista asignado a sí
  // mismo — evita una columna vacía para quien nunca se autoasigna nada.
  const mostrarColumnaAccion = esTecnico || tickets.some((t) => t.tecnicoAsignadoId === sesion?.id);

  // Preserva Estado/Prioridad/Cliente al alternar "Asignados a mí" — un simple toggle,
  // no un formulario propio, para que sea un botón de un clic.
  const hrefAsignadoAMi = (() => {
    const sp = new URLSearchParams();
    if (estado) sp.set("estado", estado);
    if (prioridad) sp.set("prioridad", prioridad);
    if (clienteId) sp.set("clienteId", clienteId);
    if (!asignadoAMi) sp.set("asignadoAMi", "1");
    const qs = sp.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-gray-50 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">{esTecnico ? "Mis tickets" : "Tickets"}</h1>
        <Link href="/tickets/nuevo" className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          + Crear ticket
        </Link>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${esTecnico ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-6"}`}>
        <KpiCard label="Total" value={kpis.total} />
        <KpiCard label="Activos" value={kpis.activos} />
        {!esTecnico && <KpiCard label="Sin asignar" value={kpis.sinAsignar} />}
        {!esTecnico && (
          <KpiCard label="Asignados a mí" value={kpis.asignadosAMi} href={hrefAsignadoAMi} activo={asignadoAMi} />
        )}
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
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-gray-600">Cliente</label>
            <ComboboxBuscable
              name="clienteId"
              defaultValue={clienteId ?? ""}
              placeholder="Todos"
              options={[{ value: "", label: "Todos" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))]}
            />
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

      <div className="space-y-2 sm:hidden">
        {conSla.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            fecha={FORMATO_FECHA.format(t.fechaCreacion)}
            esMio={t.tecnicoAsignadoId === sesion?.id}
          />
        ))}
        {tickets.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-400">
            {esTecnico ? "No tienes tickets asignados por ahora." : "No hay tickets que coincidan con los filtros."}
          </p>
        )}
      </div>

      <TableScroll className="hidden sm:block">
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
              {mostrarColumnaAccion && <th className="px-3 py-2 font-medium" />}
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
                {mostrarColumnaAccion && (
                  <td className="px-3 py-2 text-right">
                    {t.tecnicoAsignadoId === sesion?.id &&
                      (ESTADOS_CON_WIZARD_ACTIVO.has(t.estado) ? (
                        <Link
                          href={`/tickets/${t.id}/ejecucion`}
                          className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Continuar atención
                        </Link>
                      ) : (
                        <Link href={`/tickets/${t.id}`} className="text-xs text-gray-500 underline">
                          Ver detalle
                        </Link>
                      ))}
                  </td>
                )}
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={mostrarColumnaAccion ? 8 : 7} className="px-3 py-8 text-center text-sm text-gray-400">
                  {esTecnico ? "No tienes tickets asignados por ahora." : "No hay tickets que coincidan con los filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  href,
  activo,
}: {
  label: string;
  value: number;
  tone?: "amber" | "red";
  href?: string;
  activo?: boolean;
}) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-gray-900";
  const className = `rounded-xl border p-3 text-left transition-colors ${
    activo ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
  } ${href ? "hover:border-blue-300" : ""}`;
  const contenido = (
    <>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {contenido}
      </Link>
    );
  }
  return <div className={className}>{contenido}</div>;
}
