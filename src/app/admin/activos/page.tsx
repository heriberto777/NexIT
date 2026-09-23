import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TableScroll } from "@/components/ui/table-scroll";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ clienteId?: string }>;
}

const ESTILOS_ESTADO: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-800",
  EN_MANTENIMIENTO: "bg-amber-100 text-amber-800",
  FUERA_DE_SERVICIO: "bg-red-100 text-red-800",
  DADO_DE_BAJA: "bg-gray-200 text-gray-600",
};

export default async function ActivosPage({ searchParams }: PageProps) {
  const { clienteId } = await searchParams;

  const [activos, clientes] = await Promise.all([
    prisma.activo.findMany({
      where: clienteId ? { sucursal: { clienteId } } : undefined,
      include: { categoria: true, sucursal: { include: { cliente: true } } },
      orderBy: { marca: "asc" },
    }),
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const hoy = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Activos</h1>
        <Link href="/admin/activos/nuevo" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nuevo activo
        </Link>
      </div>

      <form className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
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
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {clienteId && (
          <Link href="/admin/activos" className="text-sm text-gray-500 underline">
            Limpiar
          </Link>
        )}
      </form>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium">Marca / Modelo</th>
              <th className="px-3 py-2 font-medium">Serie</th>
              <th className="px-3 py-2 font-medium">Cliente / Sede</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Garantía</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activos.map((a) => {
              const garantiaVigente = a.fechaFinGarantia ? a.fechaFinGarantia > hoy : null;
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{a.categoria.nombre}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {a.marca} {a.modelo}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{a.numeroSerie}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {a.sucursal.cliente.nombre}
                    <p className="text-xs text-gray-400">{a.sucursal.nombre}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTILOS_ESTADO[a.estado] ?? "bg-gray-100 text-gray-700"}`}>
                      {a.estado.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {garantiaVigente === null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : garantiaVigente ? (
                      <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">Vigente</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">Vencida</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {activos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay activos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
