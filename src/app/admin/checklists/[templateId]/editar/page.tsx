import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChecklistTemplateForm } from "@/components/admin/checklist-template-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ templateId: string }>;
}

export default async function EditarChecklistTemplatePage({ params }: PageProps) {
  const { templateId } = await params;

  const [template, categorias] = await Promise.all([
    prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { orden: "asc" } } },
    }),
    prisma.categoriaActivo.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  if (!template) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">
        Editar plantilla: {template.nombre} (v{template.version})
      </h1>
      <ChecklistTemplateForm
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        modoEdicion
        valoresIniciales={{
          categoriaActivoId: template.categoriaActivoId,
          nombre: template.nombre,
          items: template.items.map((i) => ({
            descripcion: i.descripcion,
            tipoRespuesta: i.tipoRespuesta,
            opciones: i.opciones,
            observacionObligatoria: i.observacionObligatoria,
          })),
        }}
      />
    </div>
  );
}
