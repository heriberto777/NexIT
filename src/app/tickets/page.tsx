import Link from "next/link";
import type { EstadoTicket, Prioridad } from "@prisma/client";
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
import { SelectorEstadosFiltro } from "@/components/tickets/selector-estados-filtro";
import { tieneAccesoAlTicket } from "@/server/services/ticket-acceso.service";
import { PageContainer } from "@/components/layout/page-container";

export const dynamic = "force-dynamic";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function comoArreglo(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  return Array.isArray(valor) ? valor : [valor];
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    estado?: string | string[];
    prioridad?: string;
    clienteId?: string;
    tecnicoId?: string;
    desde?: string;
    hasta?: string;
    asignadoAMi?: string;
    sinAsignar?: string;
    soloActivos?: string;
    slaEstado?: string;
  }>;
}

export default async function TicketsPage({ searchParams }: PageProps) {
  const sesion = await getSesionActual();
  const esTecnico = sesion?.rol === "TECNICO";

  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const estados = comoArreglo(params.estado).filter((e) => estadoTicketSchema.safeParse(e).success) as EstadoTicket[];
  const prioridad = prioridadSchema.safeParse(params.prioridad).success ? (params.prioridad as Prioridad) : undefined;
  // El filtro de cliente/técnico no se ofrece al técnico (ya ve solo lo suyo), así que
  // tampoco se respeta si llega por querystring — evita que "vea todo" armando la URL a mano.
  const clienteId = !esTecnico ? params.clienteId || undefined : undefined;
  const tecnicoId = !esTecnico ? params.tecnicoId || undefined : undefined;
  const desde = params.desde && FECHA_REGEX.test(params.desde) ? params.desde : undefined;
  const hasta = params.hasta && FECHA_REGEX.test(params.hasta) ? params.hasta : undefined;

  // Toggles tipo "Asignados a mí" — no afectan la query base ni los conteos de las
  // demás tarjetas, solo restringen qué se muestra en la tabla/tarjetas de abajo
  // (igual criterio que ya tenía "asignadoAMi", extendido a las demás tarjetas).
  const asignadoAMi = !esTecnico && params.asignadoAMi === "1";
  const sinAsignar = params.sinAsignar === "1";
  const soloActivos = params.soloActivos === "1";
  const slaEstado = params.slaEstado === "en_riesgo" || params.slaEstado === "vencido" ? params.slaEstado : undefined;

  // "Lo mío" = responsable O colaborador (ver TicketColaborador / ticket-acceso.service.ts).
  const filtroMio = sesion ? { OR: [{ tecnicoAsignadoId: sesion.id }, { colaboradores: { some: { usuarioId: sesion.id } } }] } : {};

  const baseWhere = {
    ...(estados.length > 0 ? { estado: { in: estados } } : {}),
    ...(prioridad ? { prioridad } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(tecnicoId ? { tecnicoAsignadoId: tecnicoId } : {}),
    ...(q
      ? {
          OR: [
            { numeroTicket: { contains: q, mode: "insensitive" as const } },
            { titulo: { contains: q, mode: "insensitive" as const } },
            { cliente: { nombre: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(desde || hasta
      ? {
          fechaCreacion: {
            ...(desde ? { gte: new Date(`${desde}T00:00:00`) } : {}),
            ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999`) } : {}),
          },
        }
      : {}),
    // El técnico SIEMPRE ve solo lo suyo — a diferencia de los demás toggles, esto no
    // es opcional ni combinable, es la regla de acceso del rol.
    ...(esTecnico ? filtroMio : {}),
  };

  const [ticketsBase, clientes, tecnicos, config] = await Promise.all([
    prisma.ticket.findMany({
      where: baseWhere,
      include: { cliente: true, sucursal: true, tecnicoAsignado: true, sla: true, colaboradores: { select: { usuarioId: true } } },
      orderBy: { fechaCreacion: "desc" },
    }),
    esTecnico ? Promise.resolve([]) : prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
    esTecnico
      ? Promise.resolve([])
      : prisma.usuario.findMany({ where: { rol: { in: ["TECNICO", "COORDINADOR", "ADMIN"] }, estado: "ACTIVO" }, orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);

  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "short" });
  const defaultsHoras = slaHorasPorPrioridad(config);
  const conSlaBase = ticketsBase.map((t) => ({ ...t, estadoSla: calcularEstadoSla(t, defaultsHoras) }));

  // Los números de las tarjetas siempre reflejan lo que coincide con los filtros de
  // búsqueda (q/estado/prioridad/cliente/técnico/fecha) — nunca se recalculan según qué
  // toggle esté activo, para que el conteo no "desaparezca" al hacer clic en su propia
  // tarjeta (mismo criterio que ya tenía "Asignados a mí").
  const activosBase = conSlaBase.filter((t) => !ESTADOS_TERMINALES.has(t.estado));
  const kpis = {
    total: conSlaBase.length,
    activos: activosBase.length,
    sinAsignar: activosBase.filter((t) => !t.tecnicoAsignadoId).length,
    asignadosAMi: sesion ? conSlaBase.filter((t) => tieneAccesoAlTicket(t, sesion.id)).length : 0,
    slaEnRiesgo: conSlaBase.filter((t) => t.estadoSla === "en_riesgo").length,
    slaVencido: conSlaBase.filter((t) => t.estadoSla === "vencido").length,
  };

  // Acá sí se aplican los toggles, en cadena, sobre la lista que efectivamente se
  // muestra — son combinables (ej. "Asignados a mí" + "SLA vencido" a la vez).
  let conSla = conSlaBase;
  if (soloActivos) conSla = conSla.filter((t) => !ESTADOS_TERMINALES.has(t.estado));
  if (sinAsignar) conSla = conSla.filter((t) => !t.tecnicoAsignadoId && !ESTADOS_TERMINALES.has(t.estado));
  if (asignadoAMi && sesion) conSla = conSla.filter((t) => tieneAccesoAlTicket(t, sesion.id));
  if (slaEstado) conSla = conSla.filter((t) => t.estadoSla === slaEstado);

  const hayFiltros = Boolean(
    q || estados.length > 0 || prioridad || clienteId || tecnicoId || desde || hasta || asignadoAMi || sinAsignar || soloActivos || slaEstado,
  );

  // La columna de acción aparece para el técnico (siempre ve solo lo suyo) y también
  // para un Admin/Coordinador que tenga al menos un ticket de esta lista asignado a sí
  // mismo (como responsable o colaborador) — evita una columna vacía para quien nunca
  // se autoasigna nada.
  const mostrarColumnaAccion = esTecnico || (sesion && conSla.some((t) => tieneAccesoAlTicket(t, sesion.id)));

  // Preserva los filtros de búsqueda (no los toggles) al construir el link de cada
  // tarjeta — cada tarjeta decide por separado si prende/apaga SU propio toggle,
  // conservando el estado de las demás (son combinables entre sí).
  function construirQueryBase(): URLSearchParams {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const e of estados) sp.append("estado", e);
    if (prioridad) sp.set("prioridad", prioridad);
    if (clienteId) sp.set("clienteId", clienteId);
    if (tecnicoId) sp.set("tecnicoId", tecnicoId);
    if (desde) sp.set("desde", desde);
    if (hasta) sp.set("hasta", hasta);
    return sp;
  }

  function hrefToggle(cambios: {
    asignadoAMi?: boolean;
    sinAsignar?: boolean;
    soloActivos?: boolean;
    slaEstado?: "en_riesgo" | "vencido";
  }): string {
    const sp = construirQueryBase();
    const nuevo = { asignadoAMi, sinAsignar, soloActivos, slaEstado, ...cambios };
    if (nuevo.asignadoAMi) sp.set("asignadoAMi", "1");
    if (nuevo.sinAsignar) sp.set("sinAsignar", "1");
    if (nuevo.soloActivos) sp.set("soloActivos", "1");
    if (nuevo.slaEstado) sp.set("slaEstado", nuevo.slaEstado);
    const qs = sp.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  }

  return (
    <PageContainer className="space-y-4 bg-gray-50">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">{esTecnico ? "Mis tickets" : "Tickets"}</h1>
        <Link href="/tickets/nuevo" className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          + Crear ticket
        </Link>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${esTecnico ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-6"}`}>
        <KpiCard label="Total" value={kpis.total} />
        <KpiCard label="Activos" value={kpis.activos} href={hrefToggle({ soloActivos: !soloActivos })} activo={soloActivos} />
        {!esTecnico && (
          <KpiCard label="Sin asignar" value={kpis.sinAsignar} href={hrefToggle({ sinAsignar: !sinAsignar })} activo={sinAsignar} />
        )}
        {!esTecnico && (
          <KpiCard label="Asignados a mí" value={kpis.asignadosAMi} href={hrefToggle({ asignadoAMi: !asignadoAMi })} activo={asignadoAMi} />
        )}
        <KpiCard
          label="SLA en riesgo"
          value={kpis.slaEnRiesgo}
          tone="amber"
          href={hrefToggle({ slaEstado: slaEstado === "en_riesgo" ? undefined : "en_riesgo" })}
          activo={slaEstado === "en_riesgo"}
        />
        <KpiCard
          label="SLA vencido"
          value={kpis.slaVencido}
          tone="red"
          href={hrefToggle({ slaEstado: slaEstado === "vencido" ? undefined : "vencido" })}
          activo={slaEstado === "vencido"}
        />
      </div>

      <form className="space-y-3 rounded-xl border border-gray-200 bg-white p-3" method="GET">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por # de ticket, asunto o cliente..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado (podés elegir varios)</label>
          <SelectorEstadosFiltro />
          {/* SelectorEstadosFiltro navega solo (router.push) fuera del ciclo de este form GET;
              estos hidden inputs son lo que hace que "estado" sobreviva si el usuario después
              toca "Filtrar" por otro campo (Prioridad, Técnico, etc.) sin perder la selección. */}
          {estados.map((e) => (
            <input key={e} type="hidden" name="estado" value={e} />
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
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
          {!esTecnico && (
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-gray-600">Técnico</label>
              <ComboboxBuscable
                name="tecnicoId"
                defaultValue={tecnicoId ?? ""}
                placeholder="Todos"
                options={[{ value: "", label: "Todos" }, ...tecnicos.map((t) => ({ value: t.id, label: t.nombre }))]}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Desde</label>
            <input type="date" name="desde" defaultValue={desde ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Hasta</label>
            <input type="date" name="hasta" defaultValue={hasta ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Filtrar
          </button>
          {hayFiltros && (
            <Link href="/tickets" className="text-sm text-gray-500 underline">
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      <div className="space-y-2 sm:hidden">
        {conSla.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            fecha={FORMATO_FECHA.format(t.fechaCreacion)}
            esMio={Boolean(sesion && tieneAccesoAlTicket(t, sesion.id))}
          />
        ))}
        {conSla.length === 0 && (
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
                    {sesion &&
                      tieneAccesoAlTicket(t, sesion.id) &&
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
            {conSla.length === 0 && (
              <tr>
                <td colSpan={mostrarColumnaAccion ? 8 : 7} className="px-3 py-8 text-center text-sm text-gray-400">
                  {esTecnico ? "No tienes tickets asignados por ahora." : "No hay tickets que coincidan con los filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </PageContainer>
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
