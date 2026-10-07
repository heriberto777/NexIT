import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { TableScroll } from "@/components/ui/table-scroll";
import { PageContainer } from "@/components/layout/page-container";
import { ToggleFacturacion } from "@/components/admin/facturacion/toggle-facturacion";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ clienteId?: string; estadoFacturacion?: string }>;
}

interface Fila {
  tipo: "COTIZACION" | "REPUESTO";
  id: string;
  ticketId: string;
  numeroTicket: string;
  clienteNombre: string;
  descripcion: string;
  monto: number;
  fecha: Date;
  estadoFacturacion: "PENDIENTE" | "FACTURADO";
  ticketInstalacion: { id: string; numeroTicket: string } | null;
}

export default async function FacturacionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const clienteId = params.clienteId || undefined;
  const estadoFacturacion = params.estadoFacturacion === "PENDIENTE" || params.estadoFacturacion === "FACTURADO" ? params.estadoFacturacion : undefined;

  const [cotizaciones, repuestosConsumidos, clientes, config] = await Promise.all([
    prisma.cotizacion.findMany({
      where: {
        estado: "APROBADO",
        estadoFacturacion,
        ticket: clienteId ? { clienteId } : undefined,
      },
      include: {
        ticket: { include: { cliente: true } },
        ticketInstalacion: { select: { id: true, numeroTicket: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.ticketRepuesto.findMany({
      where: {
        estadoAprobacion: "APROBADO",
        estadoFacturacion,
        ticket: clienteId ? { clienteId } : undefined,
      },
      include: { ticket: { include: { cliente: true } }, repuesto: true },
    }),
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);

  const filas: Fila[] = [
    ...cotizaciones.map((c) => ({
      tipo: "COTIZACION" as const,
      id: c.id,
      ticketId: c.ticketId,
      numeroTicket: c.ticket.numeroTicket,
      clienteNombre: c.ticket.cliente.nombre,
      descripcion: c.descripcion,
      monto: c.monto.toNumber(),
      fecha: c.fecha,
      estadoFacturacion: c.estadoFacturacion,
      ticketInstalacion: c.ticketInstalacion,
    })),
    ...repuestosConsumidos.map((r) => ({
      tipo: "REPUESTO" as const,
      id: r.id,
      ticketId: r.ticketId,
      numeroTicket: r.ticket.numeroTicket,
      clienteNombre: r.ticket.cliente.nombre,
      descripcion: `${r.repuesto.nombre} x${r.cantidad} (consumido)`,
      monto: r.costoTotal.toNumber(),
      fecha: r.ticket.fechaCreacion,
      estadoFacturacion: r.estadoFacturacion,
      ticketInstalacion: null,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "medium" });
  const totalPendiente = filas.filter((f) => f.estadoFacturacion === "PENDIENTE").reduce((acc, f) => acc + f.monto, 0);
  const totalFacturado = filas.filter((f) => f.estadoFacturacion === "FACTURADO").reduce((acc, f) => acc + f.monto, 0);
  const clientesConPendientes = new Set(filas.filter((f) => f.estadoFacturacion === "PENDIENTE").map((f) => f.clienteNombre)).size;
  const hayFiltros = Boolean(clienteId || estadoFacturacion);

  return (
    <PageContainer className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Facturación</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Pendiente de facturar</p>
          <p className="text-2xl font-semibold text-amber-700">{formatCurrency(totalPendiente, config.monedaSimbolo)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Facturado</p>
          <p className="text-2xl font-semibold text-green-700">{formatCurrency(totalFacturado, config.monedaSimbolo)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Clientes con pendientes</p>
          <p className="text-2xl font-semibold text-gray-900">{clientesConPendientes}</p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
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
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
          <select name="estadoFacturacion" defaultValue={estadoFacturacion ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente de facturar</option>
            <option value="FACTURADO">Facturado</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {hayFiltros && (
          <a href="/admin/facturacion" className="text-sm text-gray-500 underline">
            Limpiar filtros
          </a>
        )}
      </form>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Monto</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Instalación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f) => (
              <tr key={`${f.tipo}-${f.id}`} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-800">{f.clienteNombre}</td>
                <td className="px-3 py-2">
                  <Link href={`/tickets/${f.ticketId}`} className="font-medium text-blue-600 hover:underline">
                    {f.numeroTicket}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-500">{f.tipo === "COTIZACION" ? "Cotización" : "Repuesto"}</td>
                <td className="max-w-xs break-words px-3 py-2 text-gray-600">{f.descripcion}</td>
                <td className="px-3 py-2 text-gray-800">{formatCurrency(f.monto, config.monedaSimbolo)}</td>
                <td className="px-3 py-2 text-gray-500">{FORMATO_FECHA.format(f.fecha)}</td>
                <td className="px-3 py-2">
                  <ToggleFacturacion id={f.id} tipo={f.tipo} estadoInicial={f.estadoFacturacion} />
                </td>
                <td className="px-3 py-2">
                  {f.ticketInstalacion && (
                    <Link href={`/tickets/${f.ticketInstalacion.id}`} className="text-xs text-blue-600 underline">
                      {f.ticketInstalacion.numeroTicket} →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay cotizaciones aprobadas ni repuestos consumidos que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </PageContainer>
  );
}
