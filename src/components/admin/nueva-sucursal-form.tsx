"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearSucursalSchema, type CrearSucursalInput } from "@/lib/zod/admin.schema";
import { crearSucursal } from "@/server/actions/admin/crear-sucursal";
import { Button } from "@/components/ui/button";

export function NuevaSucursalForm({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearSucursalInput>({ resolver: zodResolver(crearSucursalSchema), defaultValues: { clienteId } });

  async function onSubmit(values: CrearSucursalInput) {
    setError(null);
    try {
      await crearSucursal(values);
      reset({ clienteId, nombre: "", direccion: "", ciudad: "", contactoNombre: "", contactoTelefono: "" });
      setAbierto(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  if (!abierto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAbierto(true)}>
        + Nueva sucursal
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre de la sede</label>
          <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Bodega Norte" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Ciudad</label>
          <input {...register("ciudad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Lima" />
          {errors.ciudad && <p className="mt-1 text-xs text-red-600">{errors.ciudad.message}</p>}
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Dirección</label>
          <input {...register("direccion")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Av. Industrial 450" />
          {errors.direccion && <p className="mt-1 text-xs text-red-600">{errors.direccion.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contacto (nombre)</label>
          <input {...register("contactoNombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contacto (teléfono)</label>
          <input {...register("contactoTelefono")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Guardando..." : "Guardar sucursal"}
        </Button>
      </div>
    </form>
  );
}
