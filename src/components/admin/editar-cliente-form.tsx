"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editarClienteSchema, type EditarClienteInput } from "@/lib/zod/admin.schema";
import { editarCliente } from "@/server/actions/admin/editar-cliente";
import { Button } from "@/components/ui/button";

export function EditarClienteForm({ valores }: { valores: EditarClienteInput }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarClienteInput>({ resolver: zodResolver(editarClienteSchema), defaultValues: valores });

  async function onSubmit(values: EditarClienteInput) {
    setError(null);
    setGuardado(false);
    const resultado = await editarCliente(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setGuardado(true);
    router.refresh();
  }

  return (
    <details className="rounded-xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">Editar datos del cliente</summary>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
          <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">RUC / Identificación</label>
          <input {...register("identificacionFiscal")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
          <select {...register("estado")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
    </details>
  );
}
