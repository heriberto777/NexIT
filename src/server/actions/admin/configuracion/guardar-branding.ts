"use server";

import { requireUsuario } from "@/server/auth/session";
import { actualizarConfiguracion } from "@/server/services/configuracion.service";
import { storageService } from "@/server/services/storage.service";
import { guardarBrandingSchema } from "@/lib/zod/configuracion.schema";
import type { GuardarBrandingInput } from "@/lib/zod/configuracion.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function guardarBranding(input: GuardarBrandingInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
  }

  const { empresaNombre, empresaRnc, empresaTelefono, empresaEmail, empresaDireccion } = guardarBrandingSchema.parse(input);

  await actualizarConfiguracion({
    empresaNombre,
    empresaRnc: empresaRnc || null,
    empresaTelefono: empresaTelefono || null,
    empresaEmail: empresaEmail || null,
    empresaDireccion: empresaDireccion || null,
  });

  return { ok: true };
}

// Acción aparte del formulario principal: el logo se sube apenas se elige el archivo
// (como las evidencias del wizard), no al enviar el resto del formulario de branding.
export async function subirLogoEmpresa(formData: FormData) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Archivo no recibido");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("El logo debe ser una imagen");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { key, url } = await storageService.upload({
    buffer,
    contentType: file.type,
    pathPrefix: "configuracion/logo",
  });

  await actualizarConfiguracion({ empresaLogoUrl: key });

  return { url };
}
