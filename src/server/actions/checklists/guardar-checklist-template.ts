"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { guardarChecklistTemplateSchema } from "@/lib/zod/checklist-template.schema";
import type { GuardarChecklistTemplateInput } from "@/lib/zod/checklist-template.schema";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function guardarChecklistTemplate(input: GuardarChecklistTemplateInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar checklists`);
  }

  const { categoriaActivoId, nombre, items } = guardarChecklistTemplateSchema.parse(input);

  const ultima = await prisma.checklistTemplate.findFirst({
    where: { categoriaActivoId, nombre },
    orderBy: { version: "desc" },
  });
  const version = (ultima?.version ?? 0) + 1;

  const template = await prisma.checklistTemplate.create({
    data: {
      categoriaActivoId,
      nombre,
      version,
      items: {
        create: items.map((item, index) => ({
          descripcion: item.descripcion,
          tipoRespuesta: item.tipoRespuesta,
          opciones: item.tipoRespuesta === "SELECCION" ? (item.opciones ?? []) : [],
          observacionObligatoria: item.observacionObligatoria,
          orden: index + 1,
        })),
      },
    },
  });

  return { id: template.id, version: template.version };
}
