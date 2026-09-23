"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { crearActivoSchema, crearCategoriaActivoSchema, type CrearActivoInput } from "@/lib/zod/admin.schema";
import { crearActivo } from "@/server/actions/admin/crear-activo";
import { crearCategoriaActivo } from "@/server/actions/admin/crear-categoria-activo";
import { Button } from "@/components/ui/button";

interface Sucursal {
  id: string;
  label: string;
}
interface Categoria {
  id: string;
  nombre: string;
  checklist: { nombre: string; items: number } | null;
}

interface Props {
  sucursales: Sucursal[];
  categorias: Categoria[];
}

export function NuevoActivoForm({ sucursales, categorias: categoriasIniciales }: Props) {
  const router = useRouter();
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [error, setError] = useState<string | null>(null);
  const [nuevaCategoriaAbierta, setNuevaCategoriaAbierta] = useState(false);
  const [nuevaCategoriaNombre, setNuevaCategoriaNombre] = useState("");
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CrearActivoInput>({
    resolver: zodResolver(crearActivoSchema),
    defaultValues: { sucursalId: "", categoriaId: "", marca: "", modelo: "", numeroSerie: "" },
  });

  const categoriaSeleccionada = categorias.find((c) => c.id === watch("categoriaId"));

  async function onSubmit(values: CrearActivoInput) {
    setError(null);
    try {
      const { id } = await crearActivo(values);
      router.push(`/admin/activos?nuevo=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  async function handleCrearCategoria() {
    const parsed = crearCategoriaActivoSchema.safeParse({ nombre: nuevaCategoriaNombre });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nombre de categoría inválido");
      return;
    }
    setCreandoCategoria(true);
    setError(null);
    try {
      const categoria = await crearCategoriaActivo(parsed.data);
      setCategorias((prev) => [...prev, { id: categoria.id, nombre: categoria.nombre, checklist: null }]);
      setValue("categoriaId", categoria.id);
      setNuevaCategoriaNombre("");
      setNuevaCategoriaAbierta(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la categoría");
    } finally {
      setCreandoCategoria(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/activos" className="text-sm text-blue-600 underline">
        ← Volver a activos
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sucursal</label>
          <select {...register("sucursalId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {errors.sucursalId && <p className="mt-1 text-xs text-red-600">{errors.sucursalId.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Categoría</label>
          <select {...register("categoriaId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Selecciona...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {errors.categoriaId && <p className="mt-1 text-xs text-red-600">{errors.categoriaId.message}</p>}

          {categoriaSeleccionada &&
            (categoriaSeleccionada.checklist ? (
              <p className="mt-1 text-xs text-green-700">
                Se usará el checklist &ldquo;{categoriaSeleccionada.checklist.nombre}&rdquo; ({categoriaSeleccionada.checklist.items} ítems) en el
                mantenimiento de este activo.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                Esta categoría no tiene un checklist de mantenimiento configurado todavía.
              </p>
            ))}

          {!nuevaCategoriaAbierta ? (
            <button type="button" onClick={() => setNuevaCategoriaAbierta(true)} className="mt-1 text-xs text-blue-600 underline">
              + Crear categoría nueva
            </button>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={nuevaCategoriaNombre}
                onChange={(e) => setNuevaCategoriaNombre(e.target.value)}
                placeholder="Ej. Router"
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
              <Button type="button" variant="secondary" disabled={creandoCategoria} onClick={handleCrearCategoria}>
                Agregar
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Marca</label>
            <input {...register("marca")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="APC" />
            {errors.marca && <p className="mt-1 text-xs text-red-600">{errors.marca.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
            <input {...register("modelo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Smart-UPS 3000VA" />
            {errors.modelo && <p className="mt-1 text-xs text-red-600">{errors.modelo.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Número de serie</label>
          <input {...register("numeroSerie")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.numeroSerie && <p className="mt-1 text-xs text-red-600">{errors.numeroSerie.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ubicación específica (opcional)</label>
          <input {...register("ubicacionEspecifica")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Sala de servidores, rack 2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha de instalación (opcional)</label>
            <input type="date" {...register("fechaInstalacion")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fin de garantía (opcional)</label>
            <input type="date" {...register("fechaFinGarantia")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : "Registrar activo"}
        </Button>
      </form>
    </div>
  );
}
