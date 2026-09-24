"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { tipoRespuestaChecklistSchema, type GuardarChecklistInput } from "@/lib/zod/checklist.schema";
import type { ChecklistItemPlano } from "@/types/ejecucion";
import { Button } from "@/components/ui/button";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";

interface Props {
  ticketId: string;
  items: ChecklistItemPlano[];
  isPending: boolean;
  onSubmit: (values: GuardarChecklistInput) => void;
}

// Schema laxo solo para UX en el formulario: todas las respuestas viajan como string
// (incluso numéricas), porque registrar un input contra la unión discriminada real
// de GuardarChecklistInput no tipa bien por índice dinámico. La validación real y
// autoritativa ocurre en el servidor con guardarChecklistSchema (que sí coerciona
// número/enum), así que este cast en el submit es seguro.
const checklistFormSchema = z.object({
  ticketId: z.string(),
  respuestas: z.array(
    z.object({
      checklistItemId: z.string(),
      tipoRespuesta: tipoRespuestaChecklistSchema,
      respuesta: z.string().min(1, "Este campo es obligatorio"),
      observacion: z.string().optional(),
      fotoArchivo: z.string().optional(),
    }),
  ),
});
type ChecklistFormValues = z.infer<typeof checklistFormSchema>;

function defaultRespuesta(tipo: ChecklistItemPlano["tipoRespuesta"]) {
  return tipo === "BOOLEANO" ? "SI" : "";
}

export function ChecklistStep({ ticketId, items, isPending, onSubmit }: Props) {
  const [fotosPorIndice, setFotosPorIndice] = useState<Record<number, string>>({});
  const [subiendoIndice, setSubiendoIndice] = useState<number | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChecklistFormValues>({
    resolver: zodResolver(checklistFormSchema),
    defaultValues: {
      ticketId,
      respuestas: items.map((item) => ({
        checklistItemId: item.id,
        tipoRespuesta: item.tipoRespuesta,
        respuesta: defaultRespuesta(item.tipoRespuesta),
        observacion: "",
      })),
    },
  });

  // Se sube de inmediato (igual que la evidencia general) para que el técnico vea la
  // miniatura al momento — el submit final solo manda la key ya subida, no el archivo.
  async function handleFoto(index: number, file: File) {
    setErrorFoto(null);
    setSubiendoIndice(index);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tickets/${ticketId}/checklist-foto`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? "No se pudo subir la foto");
      }
      const { key, url } = (await res.json()) as { key: string; url: string };
      setValue(`respuestas.${index}.fotoArchivo`, key);
      setFotosPorIndice((prev) => ({ ...prev, [index]: url }));
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendoIndice(null);
    }
  }

  // Sin esto, un ticket sin activo asociado (o cuya categoría no tiene checklist
  // configurado, ej. "Instalación de punto de red adicional") dejaba al técnico
  // atascado para siempre en este paso — nunca se mostraba ningún botón para avanzar.
  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Este ticket no tiene un checklist de mantenimiento configurado.
        </div>
        <Button type="button" disabled={isPending} onClick={() => onSubmit({ ticketId, respuestas: [] })} className="w-full">
          Continuar sin checklist
        </Button>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values as unknown as GuardarChecklistInput))}
      className="space-y-4"
    >
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">2. Checklist de Mantenimiento</h2>

        {items.map((item, index) => {
          const valorRespuesta = watch(`respuestas.${index}.respuesta`);
          const respuestaError = errors.respuestas?.[index]?.respuesta;

          return (
            <div key={item.id} className="space-y-1.5 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-gray-800">{item.descripcion}</p>

              {item.tipoRespuesta === "BOOLEANO" && (
                <div className="flex gap-2">
                  {(["SI", "NO", "NA"] as const).map((opcion) => (
                    <label
                      key={opcion}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                        valorRespuesta === opcion
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        value={opcion}
                        className="sr-only"
                        {...register(`respuestas.${index}.respuesta`)}
                      />
                      {opcion}
                    </label>
                  ))}
                </div>
              )}

              {item.tipoRespuesta === "NUMERO" && (
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  {...register(`respuestas.${index}.respuesta`)}
                />
              )}

              {item.tipoRespuesta === "TEXTO" && (
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  {...register(`respuestas.${index}.respuesta`)}
                />
              )}

              {item.tipoRespuesta === "SELECCION" && (
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  {...register(`respuestas.${index}.respuesta`)}
                >
                  <option value="">Selecciona una opción</option>
                  {item.opciones.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              )}

              {(item.tipoRespuesta !== "BOOLEANO" || valorRespuesta === "NO") && (
                <input
                  type="text"
                  placeholder="Observación (opcional)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                  {...register(`respuestas.${index}.observacion`)}
                />
              )}

              {respuestaError && <p className="text-xs text-red-600">{respuestaError.message}</p>}

              <div className="pt-1">
                {fotosPorIndice[index] ? (
                  <ImageThumbnail src={fotosPorIndice[index]} alt="" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <label className="inline-block cursor-pointer text-xs text-blue-600 underline">
                    {subiendoIndice === index ? "Subiendo..." : "+ Foto (opcional)"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={subiendoIndice !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFoto(index, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {errorFoto && <p className="text-xs text-red-600">{errorFoto}</p>}
      </section>

      <Button type="submit" disabled={isPending} className="w-full">
        Guardar checklist y continuar
      </Button>
    </form>
  );
}
