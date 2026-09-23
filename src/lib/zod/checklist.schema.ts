import { z } from "zod";

export const tipoRespuestaChecklistSchema = z.enum(["BOOLEANO", "TEXTO", "NUMERO", "SELECCION"]);

const baseRespuesta = {
  checklistItemId: z.string().cuid(),
  observacion: z.string().trim().max(500).optional(),
};

const respuestaBooleanoSchema = z.object({
  ...baseRespuesta,
  tipoRespuesta: z.literal("BOOLEANO"),
  respuesta: z.enum(["SI", "NO", "NA"]),
});

const respuestaTextoSchema = z.object({
  ...baseRespuesta,
  tipoRespuesta: z.literal("TEXTO"),
  respuesta: z.string().trim().min(1, "Este campo es obligatorio").max(1000),
});

const respuestaNumeroSchema = z.object({
  ...baseRespuesta,
  tipoRespuesta: z.literal("NUMERO"),
  respuesta: z.coerce.number().finite(),
});

const respuestaSeleccionSchema = z.object({
  ...baseRespuesta,
  tipoRespuesta: z.literal("SELECCION"),
  respuesta: z.string().trim().min(1),
});

// La forma exacta de "respuesta" depende de tipoRespuesta (ChecklistItem.tipoRespuesta en Prisma).
// El refine cruzado (observación obligatoria si BOOLEANO/NO) se aplica sobre la unión ya
// discriminada: discriminatedUnion exige miembros ZodObject planos, no ZodEffects.
export const checklistRespuestaSchema = z
  .discriminatedUnion("tipoRespuesta", [
    respuestaBooleanoSchema,
    respuestaTextoSchema,
    respuestaNumeroSchema,
    respuestaSeleccionSchema,
  ])
  .refine(
    (data) => data.tipoRespuesta !== "BOOLEANO" || data.respuesta !== "NO" || (data.observacion?.length ?? 0) > 0,
    { message: "Explica la observación cuando la respuesta es NO", path: ["observacion"] },
  );
export type ChecklistRespuestaInput = z.infer<typeof checklistRespuestaSchema>;

// Sin mínimo: un ticket sin activo asociado (o cuya categoría no tiene
// ChecklistTemplate) legítimamente no tiene nada que responder — ver
// checklist-step.tsx ("Continuar sin checklist").
export const guardarChecklistSchema = z.object({
  ticketId: z.string().cuid(),
  respuestas: z.array(checklistRespuestaSchema),
});
export type GuardarChecklistInput = z.infer<typeof guardarChecklistSchema>;

export const diagnosticoSchema = z.object({
  ticketId: z.string().cuid(),
  hallazgos: z.string().trim().min(10, "Describe el diagnóstico con al menos 10 caracteres").max(2000),
  causaRaizIdentificada: z.boolean(),
});
export type DiagnosticoInput = z.infer<typeof diagnosticoSchema>;
