"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { crearClienteSchema, type CrearClienteInput } from "@/lib/zod/admin.schema";
import { crearCliente } from "@/server/actions/admin/crear-cliente";
import { Button } from "@/components/ui/button";

export default function NuevoClientePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CrearClienteInput>({ resolver: zodResolver(crearClienteSchema) });

  async function onSubmit(values: CrearClienteInput) {
    setError(null);
    try {
      const { id } = await crearCliente(values);
      router.push(`/admin/clientes/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <Link href="/admin/clientes" className="text-sm text-blue-600 underline">
        ← Volver a clientes
      </Link>
      <h1 className="text-lg font-semibold text-gray-900">Nuevo cliente</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de la empresa</label>
          <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Constructora ABC S.A." />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">RUC / Identificación fiscal (opcional)</label>
          <input {...register("identificacionFiscal")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="RUC-20100000001" />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : "Crear cliente"}
        </Button>
      </form>
    </div>
  );
}
