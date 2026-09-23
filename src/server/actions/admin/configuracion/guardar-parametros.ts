"use server";

import { requireUsuario } from "@/server/auth/session";
import { actualizarConfiguracion } from "@/server/services/configuracion.service";
import { guardarParametrosSchema } from "@/lib/zod/configuracion.schema";
import type { GuardarParametrosInput } from "@/lib/zod/configuracion.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function guardarParametros(input: GuardarParametrosInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
  }

  const data = guardarParametrosSchema.parse(input);
  await actualizarConfiguracion(data);

  return { ok: true };
}
