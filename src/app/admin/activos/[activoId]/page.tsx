import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActivoForm } from "@/components/admin/activo-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ activoId: string }>;
}

export default async function ActivoDetailPage({ params }: PageProps) {
  const { activoId } = await params;

  const [activo, sucursales, categorias] = await Promise.all([
    prisma.activo.findUnique({ where: { id: activoId } }),
    prisma.sucursal.findMany({ include: { cliente: true }, orderBy: { nombre: "asc" } }),
    prisma.categoriaActivo.findMany({
      include: { checklistTemplates: { orderBy: { version: "desc" }, take: 1, include: { _count: { select: { items: true } } } } },
      orderBy: { nombre: "asc" },
    }),
  ]);

  if (!activo) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">
        {activo.marca} {activo.modelo}
      </h1>

      <ActivoForm
        modoEdicion
        sucursales={sucursales.map((s) => ({ id: s.id, label: `${s.cliente.nombre} — ${s.nombre}` }))}
        categorias={categorias.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          checklist: c.checklistTemplates[0]
            ? { nombre: c.checklistTemplates[0].nombre, items: c.checklistTemplates[0]._count.items }
            : null,
        }))}
        valoresIniciales={{
          id: activo.id,
          sucursalId: activo.sucursalId,
          categoriaId: activo.categoriaId,
          marca: activo.marca,
          modelo: activo.modelo,
          numeroSerie: activo.numeroSerie,
          ubicacionEspecifica: activo.ubicacionEspecifica ?? undefined,
          fechaInstalacion: activo.fechaInstalacion ? activo.fechaInstalacion.toISOString().slice(0, 10) : undefined,
          fechaFinGarantia: activo.fechaFinGarantia ? activo.fechaFinGarantia.toISOString().slice(0, 10) : undefined,
          estado: activo.estado,
        }}
      />
    </div>
  );
}
