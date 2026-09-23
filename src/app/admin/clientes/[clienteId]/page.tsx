import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NuevaSucursalForm } from "@/components/admin/nueva-sucursal-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ clienteId: string }>;
}

export default async function ClienteDetailPage({ params }: PageProps) {
  const { clienteId } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      sucursales: { include: { _count: { select: { activos: true } } }, orderBy: { nombre: "asc" } },
      _count: { select: { tickets: true } },
    },
  });

  if (!cliente) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/admin/clientes" className="text-sm text-blue-600 underline">
        ← Volver a clientes
      </Link>

      <header className="rounded-xl border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-gray-900">{cliente.nombre}</h1>
        <p className="text-sm text-gray-500">{cliente.identificacionFiscal ?? "Sin RUC registrado"}</p>
        <p className="mt-2 text-sm text-gray-600">
          {cliente.sucursales.length} sucursal(es) · {cliente._count.tickets} ticket(s)
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Sucursales</h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Sede</th>
                <th className="px-3 py-2 font-medium">Dirección</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium">Activos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cliente.sucursales.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">{s.nombre}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {s.direccion}, {s.ciudad}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{s.contactoNombre ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{s._count.activos}</td>
                </tr>
              ))}
              {cliente.sucursales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">
                    Sin sucursales registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <NuevaSucursalForm clienteId={cliente.id} />
      </section>
    </div>
  );
}
