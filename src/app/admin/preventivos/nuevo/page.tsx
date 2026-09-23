import { prisma } from "@/lib/prisma";
import { PlanPreventivoForm } from "@/components/admin/plan-preventivo-form";

export const dynamic = "force-dynamic";

export default async function NuevoPlanPreventivoPage() {
  const [activos, sucursales, tecnicos] = await Promise.all([
    prisma.activo.findMany({ include: { categoria: true, sucursal: { include: { cliente: true } } }, orderBy: { marca: "asc" } }),
    prisma.sucursal.findMany({ include: { cliente: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { rol: "TECNICO" }, orderBy: { nombre: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nuevo plan de mantenimiento preventivo</h1>
      <PlanPreventivoForm
        activos={activos.map((a) => ({
          id: a.id,
          label: `${a.sucursal.cliente.nombre} — ${a.sucursal.nombre} — ${a.categoria.nombre} ${a.marca} ${a.modelo}`,
        }))}
        sucursales={sucursales.map((s) => ({ id: s.id, label: `${s.cliente.nombre} — ${s.nombre}` }))}
        tecnicos={tecnicos.map((t) => ({ id: t.id, label: t.nombre }))}
      />
    </div>
  );
}
