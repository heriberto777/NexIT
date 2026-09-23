import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const templates = await prisma.checklistTemplate.findMany({
    include: { categoriaActivo: true, _count: { select: { items: true } } },
    orderBy: [{ categoriaActivoId: "asc" }, { nombre: "asc" }, { version: "desc" }],
  });

  // Solo la última versión por (categoría, nombre) — las anteriores quedan archivadas
  // como historial de lo que se usó en tickets pasados, no se editan ni se listan aquí.
  const vistas = new Set<string>();
  const ultimasVersiones = templates.filter((t) => {
    const clave = `${t.categoriaActivoId}::${t.nombre}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Checklists de mantenimiento</h1>
        <Link href="/admin/checklists/nuevo" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nueva plantilla
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Versión</th>
              <th className="px-3 py-2 font-medium">Ítems</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ultimasVersiones.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700">{t.categoriaActivo.nombre}</td>
                <td className="px-3 py-2 font-medium text-gray-800">{t.nombre}</td>
                <td className="px-3 py-2 text-gray-600">v{t.version}</td>
                <td className="px-3 py-2 text-gray-600">{t._count.items}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/checklists/${t.id}/editar`} className="text-blue-600 hover:underline">
                    Editar (nueva versión)
                  </Link>
                </td>
              </tr>
            ))}
            {ultimasVersiones.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay checklists configurados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
