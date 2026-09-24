"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearCategoriaActivoSchema, type CrearCategoriaActivoInput } from "@/lib/zod/admin.schema";
import { crearCategoriaActivo } from "@/server/actions/admin/crear-categoria-activo";
import { editarCategoriaActivo } from "@/server/actions/admin/editar-categoria-activo";
import { eliminarCategoriaActivo } from "@/server/actions/admin/eliminar-categoria-activo";
import { Button } from "@/components/ui/button";

export interface CategoriaActivoValue {
  id: string;
  nombre: string;
  activos: number;
  checklistTemplates: number;
}

export function CategoriasForm({ categorias }: { categorias: CategoriaActivoValue[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearCategoriaActivoInput>({ resolver: zodResolver(crearCategoriaActivoSchema) });

  async function onCrear(values: CrearCategoriaActivoInput) {
    setError(null);
    try {
      await crearCategoriaActivo(values);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  async function guardarEdicion(id: string) {
    setError(null);
    setGuardando(true);
    try {
      await editarCategoriaActivo({ id, nombre: nombreEdicion });
      setEditandoId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
    setError(null);
    try {
      await eliminarCategoriaActivo({ id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Categorías de activo</p>
        <p className="mb-3 text-xs text-gray-400">
          Cada categoría puede traer su propio checklist de mantenimiento (en /admin/checklists) — la categoría del equipo
          reportado determina qué checklist ve el técnico al atender el ticket.
        </p>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {categorias.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              {editandoId === c.id ? (
                <input
                  autoFocus
                  value={nombreEdicion}
                  onChange={(e) => setNombreEdicion(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
              ) : (
                <div>
                  <p className="text-sm text-gray-800">{c.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {c.activos} activo(s) · {c.checklistTemplates} checklist(s)
                  </p>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-3">
                {editandoId === c.id ? (
                  <>
                    <button type="button" disabled={guardando} onClick={() => guardarEdicion(c.id)} className="text-xs font-medium text-blue-600 hover:underline">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditandoId(null)} className="text-xs text-gray-500 hover:underline">
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(c.id);
                        setNombreEdicion(c.nombre);
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Renombrar
                    </button>
                    <button type="button" onClick={() => eliminar(c.id, c.nombre)} className="text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {categorias.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">Sin categorías todavía.</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onCrear)} className="flex items-end gap-2 border-t border-gray-100 pt-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Nueva categoría</label>
          <input {...register("nombre")} placeholder="Ej. Aire acondicionado" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creando..." : "+ Crear"}
        </Button>
      </form>
    </div>
  );
}
