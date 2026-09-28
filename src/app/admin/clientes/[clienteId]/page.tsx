import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NuevaSucursalForm } from "@/components/admin/nueva-sucursal-form";
import { EditarClienteForm } from "@/components/admin/editar-cliente-form";
import { EditarSucursalRow } from "@/components/admin/editar-sucursal-form";

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

      <EditarClienteForm
        valores={{
          id: cliente.id,
          nombre: cliente.nombre,
          identificacionFiscal: cliente.identificacionFiscal ?? undefined,
          estado: cliente.estado,
        }}
      />

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
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cliente.sucursales.map((s) => (
                <EditarSucursalRow
                  key={s.id}
                  sucursal={{
                    id: s.id,
                    nombre: s.nombre,
                    direccion: s.direccion,
                    ciudad: s.ciudad,
                    contactoNombre: s.contactoNombre,
                    contactoTelefono: s.contactoTelefono,
                    activos: s._count.activos,
                  }}
                />
              ))}
              {cliente.sucursales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
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
