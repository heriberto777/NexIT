import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TableScroll } from "@/components/ui/table-scroll";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clientes = await prisma.cliente.findMany({
    include: { _count: { select: { sucursales: true, tickets: true } } },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Clientes</h1>
        <Link href="/admin/clientes/nuevo" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nuevo cliente
        </Link>
      </div>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">RUC / Identificación</th>
              <th className="px-3 py-2 font-medium">Sucursales</th>
              <th className="px-3 py-2 font-medium">Tickets</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/clientes/${c.id}`} className="font-medium text-blue-600 hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">{c.identificacionFiscal ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{c._count.sucursales}</td>
                <td className="px-3 py-2 text-gray-600">{c._count.tickets}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      c.estado === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {c.estado}
                  </span>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">
                  Aún no hay clientes registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
