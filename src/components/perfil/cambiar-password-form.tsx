"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cambiarPasswordPropioSchema, type CambiarPasswordPropioInput } from "@/lib/zod/perfil.schema";
import { cambiarPasswordPropio } from "@/server/actions/perfil/cambiar-password-propio";
import { Button } from "@/components/ui/button";

export function CambiarPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CambiarPasswordPropioInput>({ resolver: zodResolver(cambiarPasswordPropioSchema) });

  async function onSubmit(values: CambiarPasswordPropioInput) {
    setError(null);
    setGuardado(false);
    const resultado = await cambiarPasswordPropio(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    reset();
    setGuardado(true);
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Cambiar contraseña</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Contraseña actualizada correctamente.</p>}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contraseña actual</label>
          <input type="password" {...register("passwordActual")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.passwordActual && <p className="mt-1 text-xs text-red-600">{errors.passwordActual.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contraseña nueva</label>
          <input type="password" {...register("passwordNueva")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.passwordNueva && <p className="mt-1 text-xs text-red-600">{errors.passwordNueva.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Confirmar contraseña nueva</label>
          <input type="password" {...register("passwordNuevaConfirmar")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.passwordNuevaConfirmar && <p className="mt-1 text-xs text-red-600">{errors.passwordNuevaConfirmar.message}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Cambiar contraseña"}
        </Button>
      </form>
    </section>
  );
}
