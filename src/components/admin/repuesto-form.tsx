"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { guardarRepuestoSchema, type GuardarRepuestoInput } from "@/lib/zod/inventario.schema";
import { guardarRepuesto } from "@/server/actions/admin/guardar-repuesto";
import { Button } from "@/components/ui/button";

interface Props {
  modoEdicion?: boolean;
  valoresIniciales?: GuardarRepuestoInput;
}

export function RepuestoForm({ modoEdicion, valoresIniciales }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardarRepuestoInput>({
    resolver: zodResolver(guardarRepuestoSchema),
    defaultValues: valoresIniciales ?? { codigo: "", nombre: "", stockMinimo: 0, unidadMedida: "unidad", costoUnidad: 0 },
  });

  async function onSubmit(values: GuardarRepuestoInput) {
    setError(null);
    try {
      const { id } = await guardarRepuesto(values);
      router.push(`/admin/inventario/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/inventario" className="text-sm text-blue-600 underline">
        ← Volver a inventario
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Código</label>
            <input {...register("codigo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="BAT-12V-9AH" />
            {errors.codigo && <p className="mt-1 text-xs text-red-600">{errors.codigo.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
            <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Batería 12V 9Ah" />
            {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Marca (opcional)</label>
            <input {...register("marca")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ubicación (opcional)</label>
            <input {...register("ubicacion")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Almacén Central - Estante A1" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripción (opcional)</label>
          <textarea {...register("descripcion")} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unidad de medida</label>
            <input {...register("unidadMedida")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="unidad" />
            {errors.unidadMedida && <p className="mt-1 text-xs text-red-600">{errors.unidadMedida.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Stock mínimo</label>
            <input type="number" min={0} {...register("stockMinimo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Costo por unidad (S/)</label>
            <input type="number" min={0} step="0.01" {...register("costoUnidad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        {!modoEdicion && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Stock inicial (opcional)</label>
            <input type="number" min={0} {...register("stockInicial")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-gray-500">Se registra como un movimiento de ENTRADA en el Kardex.</p>
          </div>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear repuesto"}
        </Button>
      </form>
    </div>
  );
}
