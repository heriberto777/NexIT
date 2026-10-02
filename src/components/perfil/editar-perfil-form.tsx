"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editarPerfilSchema, type EditarPerfilInput } from "@/lib/zod/perfil.schema";
import { editarPerfil } from "@/server/actions/perfil/editar-perfil";
import { Button } from "@/components/ui/button";

interface Props {
  nombre: string;
  email: string;
  telegramChatId: string | null;
  whatsappTelefono: string | null;
}

export function EditarPerfilForm({ nombre, email, telegramChatId, whatsappTelefono }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarPerfilInput>({
    resolver: zodResolver(editarPerfilSchema),
    defaultValues: { nombre, telegramChatId: telegramChatId ?? "", whatsappTelefono: whatsappTelefono ?? "" },
  });

  async function onSubmit(values: EditarPerfilInput) {
    setError(null);
    setGuardado(false);
    const resultado = await editarPerfil(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setGuardado(true);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Mis datos</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
          <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Correo</label>
          <input value={email} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
          <p className="mt-1 text-xs text-gray-400">El correo es tu identificador de acceso y no se puede cambiar desde aquí.</p>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Notificaciones por chat (opcional)</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Telegram — Chat ID</label>
              <input {...register("telegramChatId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ej. 123456789" />
              <p className="mt-1 text-xs text-gray-400">
                Escríbele a tu bot de Telegram y consulta tu chat_id con{" "}
                <span className="font-mono">@userinfobot</span>, o pídele al administrador que te ayude a vincularlo.
              </p>
              {errors.telegramChatId && <p className="mt-1 text-xs text-red-600">{errors.telegramChatId.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">WhatsApp — Teléfono</label>
              <input
                {...register("whatsappTelefono")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. +51987654321"
              />
              <p className="mt-1 text-xs text-gray-400">Incluye el código de país (formato internacional).</p>
              {errors.whatsappTelefono && <p className="mt-1 text-xs text-red-600">{errors.whatsappTelefono.message}</p>}
            </div>
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
    </section>
  );
}
