import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PlanPreventivoForm } from "@/components/admin/plan-preventivo-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ planId: string }>;
}

export default async function EditarPlanPreventivoPage({ params }: PageProps) {
  const { planId } = await params;

  const [plan, activos, sucursales, tecnicos] = await Promise.all([
    prisma.planMantenimientoPreventivo.findUnique({ where: { id: planId } }),
    prisma.activo.findMany({ include: { categoria: true, sucursal: { include: { cliente: true } } }, orderBy: { marca: "asc" } }),
    prisma.sucursal.findMany({ include: { cliente: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { rol: "TECNICO" }, orderBy: { nombre: "asc" } }),
  ]);

  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Editar plan: {plan.titulo}</h1>
      <PlanPreventivoForm
        activos={activos.map((a) => ({
          id: a.id,
          label: `${a.sucursal.cliente.nombre} — ${a.sucursal.nombre} — ${a.categoria.nombre} ${a.marca} ${a.modelo}`,
        }))}
        sucursales={sucursales.map((s) => ({ id: s.id, label: `${s.cliente.nombre} — ${s.nombre}` }))}
        tecnicos={tecnicos.map((t) => ({ id: t.id, label: t.nombre }))}
        valoresIniciales={{
          id: plan.id,
          titulo: plan.titulo,
          descripcion: plan.descripcion ?? undefined,
          activoId: plan.activoId ?? undefined,
          sucursalId: plan.sucursalId ?? undefined,
          frecuencia: plan.frecuencia,
          proximaFecha: plan.proximaFecha.toISOString().slice(0, 10),
          tecnicoAsignadoId: plan.tecnicoAsignadoId ?? undefined,
          prioridad: plan.prioridad,
        }}
      />
    </div>
  );
}
