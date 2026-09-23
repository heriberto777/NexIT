"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { guardarChecklistTemplateSchema, type GuardarChecklistTemplateInput } from "@/lib/zod/checklist-template.schema";
import { guardarChecklistTemplate } from "@/server/actions/checklists/guardar-checklist-template";
import { Button } from "@/components/ui/button";

interface Categoria {
  id: string;
  nombre: string;
}

interface Props {
  categorias: Categoria[];
  modoEdicion?: boolean;
  valoresIniciales?: GuardarChecklistTemplateInput;
}

const TIPOS_RESPUESTA = [
  { value: "BOOLEANO", label: "Sí / No" },
  { value: "NUMERO", label: "Número" },
  { value: "SELECCION", label: "Selección" },
  { value: "TEXTO", label: "Texto libre" },
] as const;

export function ChecklistTemplateForm({ categorias, modoEdicion, valoresIniciales }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GuardarChecklistTemplateInput>({
    resolver: zodResolver(guardarChecklistTemplateSchema),
    defaultValues: valoresIniciales ?? {
      categoriaActivoId: "",
      nombre: "",
      items: [{ descripcion: "", tipoRespuesta: "BOOLEANO", opciones: [], observacionObligatoria: false }],
    },
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });

  async function onSubmit(values: GuardarChecklistTemplateInput) {
    setError(null);
    try {
      await guardarChecklistTemplate(values);
      router.push("/admin/checklists");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/checklists" className="text-sm text-blue-600 underline">
        ← Volver a checklists
      </Link>

      {modoEdicion && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Editar crea una <strong>nueva versión</strong> de esta plantilla — la versión anterior queda intacta para
          no afectar tickets ya ejecutados con ella.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Categoría de activo</label>
            <select
              {...register("categoriaActivoId")}
              disabled={modoEdicion}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            >
              <option value="">Selecciona...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {errors.categoriaActivoId && <p className="mt-1 text-xs text-red-600">{errors.categoriaActivoId.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de la plantilla</label>
            <input
              {...register("nombre")}
              disabled={modoEdicion}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              placeholder="Mantenimiento preventivo UPS"
            />
            {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Ítems del checklist</h2>

          {fields.map((field, index) => {
            const tipoActual = watch(`items.${index}.tipoRespuesta`);
            return (
              <div key={field.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs text-gray-400">#{index + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      {...register(`items.${index}.descripcion`)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="¿Batería en buen estado?"
                    />
                    {errors.items?.[index]?.descripcion && (
                      <p className="text-xs text-red-600">{errors.items[index]?.descripcion?.message}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        {...register(`items.${index}.tipoRespuesta`)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {TIPOS_RESPUESTA.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>

                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="checkbox" {...register(`items.${index}.observacionObligatoria`)} className="h-3.5 w-3.5" />
                        Exigir observación si falla
                      </label>
                    </div>

                    {tipoActual === "SELECCION" && (
                      <input
                        defaultValue={field.opciones?.join(", ") ?? ""}
                        {...register(`items.${index}.opciones` as const, {
                          setValueAs: (v: unknown) =>
                            typeof v === "string"
                              ? v.split(",").map((o) => o.trim()).filter(Boolean)
                              : v,
                        })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
                        placeholder="Opciones separadas por coma: Optimo, Regular, Critico"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-500 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {errors.items?.message && <p className="text-xs text-red-600">{errors.items.message}</p>}

          <Button
            type="button"
            variant="secondary"
            onClick={() => append({ descripcion: "", tipoRespuesta: "BOOLEANO", opciones: [], observacionObligatoria: false })}
          >
            + Agregar ítem
          </Button>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : modoEdicion ? "Guardar nueva versión" : "Crear plantilla"}
        </Button>
      </form>
    </div>
  );
}
