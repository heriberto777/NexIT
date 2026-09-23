import { prisma } from "@/lib/prisma";
import { NuevoActivoForm } from "@/components/admin/nuevo-activo-form";

export const dynamic = "force-dynamic";

export default async function NuevoActivoPage() {
  const [sucursales, categorias] = await Promise.all([
    prisma.sucursal.findMany({ include: { cliente: true }, orderBy: { nombre: "asc" } }),
    prisma.categoriaActivo.findMany({
      include: { checklistTemplates: { orderBy: { version: "desc" }, take: 1, include: { _count: { select: { items: true } } } } },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nuevo activo</h1>

      <NuevoActivoForm
        sucursales={sucursales.map((s) => ({ id: s.id, label: `${s.cliente.nombre} — ${s.nombre}` }))}
        categorias={categorias.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          checklist: c.checklistTemplates[0]
            ? { nombre: c.checklistTemplates[0].nombre, items: c.checklistTemplates[0]._count.items }
            : null,
        }))}
      />
    </div>
  );
}
