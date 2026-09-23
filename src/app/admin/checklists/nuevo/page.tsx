import { prisma } from "@/lib/prisma";
import { ChecklistTemplateForm } from "@/components/admin/checklist-template-form";

export const dynamic = "force-dynamic";

export default async function NuevaChecklistTemplatePage() {
  const categorias = await prisma.categoriaActivo.findMany({ orderBy: { nombre: "asc" } });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nueva plantilla de checklist</h1>
      <ChecklistTemplateForm categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))} />
    </div>
  );
}
