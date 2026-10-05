import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/layout/page-container";

export const dynamic = "force-dynamic";

// Listado de solo lectura de TODAS las sucursales de TODOS los clientes — antes no
// había ningún acceso directo desde el menú a "Sedes", solo se llegaba entrando a un
// cliente puntual. La edición real sigue viviendo en /admin/clientes/[clienteId], acá
// no se duplica ese formulario, solo se da un punto de entrada/búsqueda global.
export default async function SedesPage() {
  const sucursales = await prisma.sucursal.findMany({
    include: { cliente: true, _count: { select: { activos: true } } },
    orderBy: [{ cliente: { nombre: "asc" } }, { nombre: "asc" }],
  });

  return (
    <PageContainer className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Sedes</h1>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Sede</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Ciudad</th>
              <th className="px-3 py-2 font-medium">Dirección</th>
              <th className="px-3 py-2 font-medium">Activos</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sucursales.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-medium text-gray-900">{s.nombre}</td>
                <td className="px-3 py-2 text-gray-600">{s.cliente.nombre}</td>
                <td className="px-3 py-2 text-gray-600">{s.ciudad}</td>
                <td className="px-3 py-2 text-gray-600">{s.direccion}</td>
                <td className="px-3 py-2 text-gray-600">{s._count.activos}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/clientes/${s.clienteId}`} className="text-xs text-blue-600 underline">
                    Ver cliente →
                  </Link>
                </td>
              </tr>
            ))}
            {sucursales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">
                  Sin sucursales registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
