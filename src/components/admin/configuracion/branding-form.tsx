"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { guardarBrandingSchema, type GuardarBrandingInput } from "@/lib/zod/configuracion.schema";
import { guardarBranding, subirLogoEmpresa } from "@/server/actions/admin/configuracion/guardar-branding";
import { Button } from "@/components/ui/button";

export interface BrandingValues {
  empresaNombre: string;
  empresaRnc: string;
  empresaTelefono: string;
  empresaEmail: string;
  empresaDireccion: string;
}

export function BrandingForm({ valores, logoUrl }: { valores: BrandingValues; logoUrl: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [logoActual, setLogoActual] = useState(logoUrl);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardarBrandingInput>({ resolver: zodResolver(guardarBrandingSchema), defaultValues: valores });

  async function onSubmit(values: GuardarBrandingInput) {
    setError(null);
    setGuardado(false);
    try {
      await guardarBranding(values);
      setGuardado(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  async function subirLogo(file: File) {
    setErrorLogo(null);
    setSubiendoLogo(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const { url } = await subirLogoEmpresa(formData);
      setLogoActual(url);
      router.refresh();
    } catch (err) {
      setErrorLogo(err instanceof Error ? err.message : "No se pudo subir el logo");
    } finally {
      setSubiendoLogo(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Logo (aparece en el PDF de informes y en la interfaz)</p>
        <div className="flex items-center gap-3">
          {logoActual ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de tamaño variable subido por el admin, no un asset estático
            <img src={logoActual} alt="Logo de la empresa" className="h-14 w-14 rounded-lg border border-gray-200 object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
              Sin logo
            </div>
          )}
          <div>
            <input
              ref={inputLogoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void subirLogo(file);
              }}
            />
            <Button type="button" variant="secondary" onClick={() => inputLogoRef.current?.click()} disabled={subiendoLogo}>
              {subiendoLogo ? "Subiendo..." : "Cambiar logo"}
            </Button>
            {errorLogo && <p className="mt-1 text-xs text-red-600">{errorLogo}</p>}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 border-t border-gray-100 pt-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de la empresa</label>
          <input {...register("empresaNombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {errors.empresaNombre && <p className="mt-1 text-xs text-red-600">{errors.empresaNombre.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">RNC / RUC</label>
          <input {...register("empresaRnc")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
            <input {...register("empresaTelefono")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo de contacto</label>
            <input type="email" {...register("empresaEmail")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {errors.empresaEmail && <p className="mt-1 text-xs text-red-600">{errors.empresaEmail.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dirección</label>
          <input {...register("empresaDireccion")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}
