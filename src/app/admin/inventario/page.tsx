import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { TableScroll } from "@/components/ui/table-scroll";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [repuestos, config] = await Promise.all([
    prisma.repuesto.findMany({ orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);
  const criticos = repuestos.filter((r) => r.stockActual <= r.stockMinimo);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Inventario de repuestos</h1>
        <Link href="/admin/inventario/nuevo" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nuevo repuesto
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Total repuestos</p>
          <p className="text-2xl font-semibold text-gray-900">{repuestos.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Stock crítico</p>
          <p className="text-2xl font-semibold text-red-600">{criticos.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Valor total inventario</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatCurrency(
              repuestos.reduce((acc, r) => acc + r.stockActual * r.costoUnidad.toNumber(), 0),
              config.monedaSimbolo,
            )}
          </p>
        </div>
      </div>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">Costo/unidad</th>
              <th className="px-3 py-2 font-medium">Ubicación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {repuestos.map((r) => {
              const critico = r.stockActual <= r.stockMinimo;
              return (
                <tr key={r.id} className={cn("hover:bg-gray-50", critico && "bg-red-50/60")}>
                  <td className="px-3 py-2 text-gray-600">{r.codigo}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/inventario/${r.id}`} className="font-medium text-blue-600 hover:underline">
                      {r.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.marca ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", critico ? "text-red-700" : "text-gray-800")}>{r.stockActual}</span>
                    <span className="text-gray-400"> / mín. {r.stockMinimo} {r.unidadMedida}</span>
                    {critico && (
                      <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        Stock crítico
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{formatCurrency(r.costoUnidad.toNumber(), config.monedaSimbolo)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.ubicacion ?? "—"}</td>
                </tr>
              );
            })}
            {repuestos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay repuestos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
