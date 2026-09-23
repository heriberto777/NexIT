"use server";

import { requireUsuario } from "@/server/auth/session";
import { generarTicketsPreventivosSchema } from "@/lib/zod/plan-preventivo.schema";
import type { GenerarTicketsPreventivosInput } from "@/lib/zod/plan-preventivo.schema";
import { generarTicketsPreventivos as generarTicketsPreventivosService } from "@/server/services/preventivos.service";

const ROLES_PERMITIDOS = ["COORDINADOR", "ADMIN"] as const;

export async function generarTicketsPreventivos(input: GenerarTicketsPreventivosInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede generar tickets preventivos`);
  }

  const { diasVentana } = generarTicketsPreventivosSchema.parse(input);
  return generarTicketsPreventivosService({ diasVentana, usuarioId: usuario.id });
}
