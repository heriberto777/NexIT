"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { guardarSmtpSchema, type GuardarSmtpInput } from "@/lib/zod/configuracion.schema";
import { guardarSmtp } from "@/server/actions/admin/configuracion/guardar-smtp";
import { probarSmtpAction } from "@/server/actions/admin/configuracion/probar-integraciones";
import { Button } from "@/components/ui/button";

export interface SmtpValues {
  smtpHost: string;
  smtpPort?: number;
  smtpUser: string;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpSsl: boolean;
  tieneSmtpPass: boolean;
}

export function SmtpForm({ valores }: { valores: SmtpValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPendingPrueba, startPrueba] = useTransition();
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardarSmtpInput>({
    resolver: zodResolver(guardarSmtpSchema),
    defaultValues: { ...valores, smtpPass: "" },
  });

  async function onSubmit(values: GuardarSmtpInput) {
    setError(null);
    setGuardado(false);
    try {
      await guardarSmtp(values);
      setGuardado(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  function probar() {
    setResultadoPrueba(null);
    startPrueba(async () => {
      const resultado = await probarSmtpAction();
      setResultadoPrueba(resultado);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Host SMTP</label>
          <input {...register("smtpHost")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="smtp.tuproveedor.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Puerto</label>
          <input type="number" {...register("smtpPort")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="587" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Usuario</label>
          <input {...register("smtpUser")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contraseña {valores.tieneSmtpPass && <span className="text-xs font-normal text-gray-400">(configurada — deja vacío para no cambiarla)</span>}
          </label>
          <input type="password" {...register("smtpPass")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={valores.tieneSmtpPass ? "••••••••" : ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Correo remitente</label>
          <input type="email" {...register("smtpFromEmail")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.smtpFromEmail && <p className="mt-1 text-xs text-red-600">{errors.smtpFromEmail.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre del remitente</label>
          <input {...register("smtpFromName")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="NexIT Soporte" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" {...register("smtpSsl")} className="rounded border-gray-300" />
        Usar SSL/TLS
      </label>

      <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="secondary" onClick={probar} disabled={isPendingPrueba}>
          {isPendingPrueba ? "Enviando..." : "Probar envío de correo"}
        </Button>
      </div>

      {resultadoPrueba && (
        <p className={`rounded-lg px-3 py-2 text-sm ${resultadoPrueba.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {resultadoPrueba.mensaje}
        </p>
      )}
    </form>
  );
}
