"use server";

import { requireUsuario } from "@/server/auth/session";
import { actualizarConfiguracion } from "@/server/services/configuracion.service";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { guardarIaSchema } from "@/lib/zod/configuracion.schema";
import type { GuardarIaInput } from "@/lib/zod/configuracion.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function guardarIa(input: GuardarIaInput): Promise<ActionResult<{ ok: true }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede modificar la configuración`);
    }

    const { iaProveedor, iaApiKey, iaModelo, iaBaseUrl, iaHabilitada } = guardarIaSchema.parse(input);

    await actualizarConfiguracion({
      iaProveedor,
      // Campo vacío = "no cambiar la key ya guardada" — mismo patrón que smtpPass/webhookSecret.
      ...(iaApiKey ? { iaApiKey } : {}),
      iaModelo,
      iaBaseUrl: iaBaseUrl || null,
      iaHabilitada,
    });

    await registrarAuditoria({
      usuario,
      accion: "configuracion.ia",
      entidad: "ConfiguracionSistema",
      detalle: `Proveedor ${iaProveedor}, modelo ${iaModelo}${iaHabilitada ? " (habilitado)" : " (deshabilitado)"}`,
    });

    return { ok: true };
  });
}
