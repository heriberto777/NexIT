import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TableScroll } from "@/components/ui/table-scroll";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";
import { PageContainer } from "@/components/layout/page-container";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ clienteId?: string }>;
}

const ESTILOS_ESTADO: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-800",
  INACTIVO: "bg-gray-200 text-gray-600",
};

export default async function SistemasSoftwarePage({ searchParams }: PageProps) {
  const { clienteId } = await searchParams;

  const [sistemas, clientes] = await Promise.all([
    prisma.sistemaSoftware.findMany({
      where: clienteId ? { clienteId } : undefined,
      include: { cliente: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  return (
    <PageContainer className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sistemas de software</h1>
          <p className="text-sm text-gray-500">
            Catálogo de sistemas/software de terceros que cada cliente tiene instalado — se ofrece al reportar un
            ticket cuando el problema es de &quot;Sistema&quot; y no de un equipo físico.
          </p>
        </div>
        <Link href="/admin/sistemas-software/nuevo" className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nuevo sistema
        </Link>
      </div>

      <form className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
        <div className="w-48">
          <label className="mb-1 block text-xs font-medium text-gray-600">Cliente</label>
          <ComboboxBuscable
            name="clienteId"
            defaultValue={clienteId ?? ""}
            placeholder="Todos"
            options={[{ value: "", label: "Todos" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))]}
          />
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {clienteId && (
          <Link href="/admin/sistemas-software" className="text-sm text-gray-500 underline">
            Limpiar
          </Link>
        )}
      </form>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sistemas.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/admin/sistemas-software/${s.id}`} className="text-blue-600 hover:underline">
                    {s.nombre}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">{s.proveedor ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">{s.cliente.nombre}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTILOS_ESTADO[s.estado] ?? "bg-gray-100 text-gray-700"}`}>
                    {s.estado}
                  </span>
                </td>
              </tr>
            ))}
            {sistemas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay sistemas de software registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
    </PageContainer>
  );
}
