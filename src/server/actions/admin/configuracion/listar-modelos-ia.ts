"use server";

import { requireUsuario } from "@/server/auth/session";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { listarModelosIA, type ModeloIA } from "@/server/services/ia.service";
import { listarModelosIaSchema } from "@/lib/zod/configuracion.schema";
import type { ListarModelosIaInput } from "@/lib/zod/configuracion.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function listarModelosIaAction(input: ListarModelosIaInput): Promise<ActionResult<ModeloIA[]>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
    }

    const { iaProveedor, iaApiKey, iaBaseUrl } = listarModelosIaSchema.parse(input);

    // Campo de key vacío = "usar la que ya está guardada" (el admin no la reescribe
    // cada vez que solo quiere refrescar la lista) — mismo criterio que guardar-ia.ts.
    let apiKeyEfectiva = iaApiKey || null;
    if (!apiKeyEfectiva) {
      const config = await obtenerConfiguracion();
      apiKeyEfectiva = config.iaProveedor === iaProveedor ? config.iaApiKey : null;
    }

    return listarModelosIA({ iaProveedor, iaApiKey: apiKeyEfectiva, iaBaseUrl: iaBaseUrl || null });
  });
}
