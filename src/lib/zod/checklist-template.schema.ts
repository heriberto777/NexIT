import { z } from "zod";
import { tipoRespuestaChecklistSchema } from "@/lib/zod/checklist.schema";

export const checklistItemFormSchema = z.object({
  descripcion: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  tipoRespuesta: tipoRespuestaChecklistSchema,
  opciones: z.array(z.string().trim().min(1)).optional(),
  observacionObligatoria: z.boolean(),
});
export type ChecklistItemFormInput = z.infer<typeof checklistItemFormSchema>;

// Guardar SIEMPRE crea una nueva versión del template (nunca muta ítems existentes):
// tickets ya ejecutados referencian ChecklistItemTemplate por id, así que editar una
// plantilla en el sitio rompería su historial o violaría la FK al intentar borrar
// ítems en uso. La pantalla de ejecución ya toma "la última versión" por categoría,
// así que una nueva versión se activa sola para los próximos mantenimientos.
export const guardarChecklistTemplateSchema = z.object({
  categoriaActivoId: z.string().cuid(),
  nombre: z.string().trim().min(3, "Mínimo 3 caracteres").max(120),
  items: z.array(checklistItemFormSchema).min(1, "Agrega al menos un ítem"),
});
export type GuardarChecklistTemplateInput = z.infer<typeof guardarChecklistTemplateSchema>;
