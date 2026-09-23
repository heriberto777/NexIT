import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calcularVigenciaPlan, type EstadoVigenciaPlan } from "@/lib/utils/plan-preventivo";
import { GenerarTicketsPreventivosButton } from "@/components/admin/generar-tickets-preventivos-button";
import { TogglePlanEstadoButton } from "@/components/admin/toggle-plan-estado-button";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

const ESTILOS_VIGENCIA: Record<EstadoVigenciaPlan, { label: string; className: string }> = {
  vencido: { label: "Vencido", className: "bg-red-100 text-red-800" },
  proximo: { label: "Próximo a vencer", className: "bg-amber-100 text-amber-800" },
  programado: { label: "Programado", className: "bg-green-50 text-green-700" },
};

export default async function PreventivosPage() {
  const [planes, config] = await Promise.all([
    prisma.planMantenimientoPreventivo.findMany({
      include: {
        activo: { include: { sucursal: { include: { cliente: true } }, categoria: true } },
        sucursal: { include: { cliente: true } },
        tecnicoAsignado: true,
      },
      orderBy: { proximaFecha: "asc" },
    }),
    obtenerConfiguracion(),
  ]);
  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "medium" });

  const kpis = {
    total: planes.length,
    vencidos: planes.filter((p) => p.estado === "ACTIVO" && calcularVigenciaPlan(p.proximaFecha) === "vencido").length,
    proximos: planes.filter((p) => p.estado === "ACTIVO" && calcularVigenciaPlan(p.proximaFecha) === "proximo").length,
    pausados: planes.filter((p) => p.estado === "PAUSADO").length,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Mantenimientos preventivos</h1>
        <Link href="/admin/preventivos/nuevo" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nuevo plan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Total planes</p>
          <p className="text-2xl font-semibold text-gray-900">{kpis.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Vencidos</p>
          <p className="text-2xl font-semibold text-red-600">{kpis.vencidos}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Próximos a vencer</p>
          <p className="text-2xl font-semibold text-amber-600">{kpis.proximos}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Pausados</p>
          <p className="text-2xl font-semibold text-gray-500">{kpis.pausados}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <GenerarTicketsPreventivosButton />
        <p className="mt-2 text-xs text-gray-500">
          Genera un ticket ASIGNADO por cada plan activo cuya próxima fecha ya llegó, y reprograma su siguiente
          fecha según la frecuencia.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Activo / Sede</th>
              <th className="px-3 py-2 font-medium">Frecuencia</th>
              <th className="px-3 py-2 font-medium">Próxima fecha</th>
              <th className="px-3 py-2 font-medium">Técnico</th>
              <th className="px-3 py-2 font-medium">Vigencia</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {planes.map((p) => {
              const vigencia = calcularVigenciaPlan(p.proximaFecha);
              const cliente = p.activo?.sucursal.cliente.nombre ?? p.sucursal?.cliente.nombre ?? "—";
              const lugar = p.activo
                ? `${p.activo.categoria.nombre} — ${p.activo.marca} ${p.activo.modelo}`
                : (p.sucursal?.nombre ?? "—");
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/preventivos/${p.id}/editar`} className="font-medium text-blue-600 hover:underline">
                      {p.titulo}
                    </Link>
                    <p className="text-xs text-gray-500">{cliente}</p>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{lugar}</td>
                  <td className="px-3 py-2 text-gray-600">{p.frecuencia}</td>
                  <td className="px-3 py-2 text-gray-600">{FORMATO_FECHA.format(p.proximaFecha)}</td>
                  <td className="px-3 py-2 text-gray-600">{p.tecnicoAsignado?.nombre ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.estado === "ACTIVO" ? (
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTILOS_VIGENCIA[vigencia].className}`}>
                        {ESTILOS_VIGENCIA[vigencia].label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        p.estado === "ACTIVO" ? "bg-blue-50 text-blue-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TogglePlanEstadoButton id={p.id} estado={p.estado} />
                  </td>
                </tr>
              );
            })}
            {planes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay planes de mantenimiento preventivo registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
