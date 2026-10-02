"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editarSucursalSchema, type EditarSucursalInput } from "@/lib/zod/admin.schema";
import { editarSucursal } from "@/server/actions/admin/editar-sucursal";
import { Button } from "@/components/ui/button";

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  activos: number;
}

export function EditarSucursalRow({ sucursal }: { sucursal: Sucursal }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarSucursalInput>({
    resolver: zodResolver(editarSucursalSchema),
    defaultValues: {
      id: sucursal.id,
      nombre: sucursal.nombre,
      direccion: sucursal.direccion,
      ciudad: sucursal.ciudad,
      contactoNombre: sucursal.contactoNombre ?? undefined,
      contactoTelefono: sucursal.contactoTelefono ?? undefined,
    },
  });

  async function onSubmit(values: EditarSucursalInput) {
    setError(null);
    const resultado = await editarSucursal(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <tr>
        <td className="px-3 py-2 font-medium text-gray-800">{sucursal.nombre}</td>
        <td className="px-3 py-2 text-gray-600">
          {sucursal.direccion}, {sucursal.ciudad}
        </td>
        <td className="px-3 py-2 text-gray-600">{sucursal.contactoNombre ?? "—"}</td>
        <td className="px-3 py-2 text-gray-600">{sucursal.activos}</td>
        <td className="px-3 py-2 text-right">
          <button type="button" onClick={() => setEditando(true)} className="text-sm text-blue-600 underline">
            Editar
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={5} className="bg-gray-50 px-3 py-3">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nombre de la sede</label>
              <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Ciudad</label>
              <input {...register("ciudad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              {errors.ciudad && <p className="mt-1 text-xs text-red-600">{errors.ciudad.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Dirección</label>
              <input {...register("direccion")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
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
            <Button type="button" variant="ghost" onClick={() => setEditando(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}
