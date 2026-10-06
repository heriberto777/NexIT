"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearEspecialidadSchema, type CrearEspecialidadInput } from "@/lib/zod/admin.schema";
import { crearEspecialidad } from "@/server/actions/admin/crear-especialidad";
import { editarEspecialidad } from "@/server/actions/admin/editar-especialidad";
import { eliminarEspecialidad } from "@/server/actions/admin/eliminar-especialidad";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";

export interface EspecialidadValue {
  id: string;
  nombre: string;
  usuarios: number;
}

// Mismo patrón que CategoriasForm (categorías de activo) — catálogo chico, crear/
// renombrar/eliminar inline, sin paginar.
export function EspecialidadesForm({ especialidades }: { especialidades: EspecialidadValue[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearEspecialidadInput>({ resolver: zodResolver(crearEspecialidadSchema) });

  async function onCrear(values: CrearEspecialidadInput) {
    setError(null);
    const resultado = await crearEspecialidad(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    reset();
    router.refresh();
  }

  async function guardarEdicion(id: string) {
    setError(null);
    setGuardando(true);
    const resultado = await editarEspecialidad({ id, nombre: nombreEdicion });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEditandoId(null);
    router.refresh();
  }

  async function eliminar(id: string, nombre: string) {
    const ok = await confirm({ mensaje: `¿Eliminar la especialidad "${nombre}"?`, textoConfirmar: "Eliminar", peligroso: true });
    if (!ok) return;
    setError(null);
    const resultado = await eliminarEspecialidad({ id });
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Especialidades de técnico</p>
        <p className="mb-3 text-xs text-gray-400">
          Catálogo que se ofrece al crear/editar un usuario con rol Técnico — un técnico puede tener varias.
        </p>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {especialidades.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
              {editandoId === e.id ? (
                <input
                  autoFocus
                  value={nombreEdicion}
                  onChange={(ev) => setNombreEdicion(ev.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-gray-800">{e.nombre}</p>
                  <p className="text-xs text-gray-400">{e.usuarios} usuario(s)</p>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-3">
                {editandoId === e.id ? (
                  <>
                    <button type="button" disabled={guardando} onClick={() => guardarEdicion(e.id)} className="text-xs font-medium text-blue-600 hover:underline">
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
                        setEditandoId(e.id);
                        setNombreEdicion(e.nombre);
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Renombrar
                    </button>
                    <button type="button" onClick={() => eliminar(e.id, e.nombre)} className="text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {especialidades.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">Sin especialidades todavía.</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onCrear)} className="flex items-end gap-2 border-t border-gray-100 pt-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Nueva especialidad</label>
          <input {...register("nombre")} placeholder="Ej. Refrigeración" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creando..." : "+ Crear"}
        </Button>
      </form>
    </div>
  );
}
