"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { diagnosticoSchema } from "@/lib/zod/checklist.schema";
import type { DiagnosticoInput } from "@/lib/zod/checklist.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

// Paso 1 (continuación): guarda los hallazgos del diagnóstico antes de avanzar al checklist.
export async function guardarDiagnostico(input: DiagnosticoInput): Promise<ActionResult<{ ok: true }>> {
  return ejecutarAccion(async () => {
    // Sin restricción de rol acá: un Admin/Coordinador puede estar asignado como
    // "técnico" de este ticket (ver asignar-tecnico.ts) y ejecutar el wizard él mismo —
    // la propiedad (el chequeo de abajo), no el rol, es lo que habilita cada paso.
    const usuario = await requireUsuario();
    const { ticketId, hallazgos, causaRaizIdentificada } = diagnosticoSchema.parse(input);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    if (ticket.tecnicoAsignadoId !== usuario.id) {
      throw new Error("Este ticket no está asignado a este técnico");
    }

    await prisma.ticketHistorial.create({
      data: {
        ticketId,
        usuarioId: usuario.id,
        estadoNuevo: "EN_DIAGNOSTICO",
        comentario: `Diagnóstico: ${hallazgos} (causa raíz ${causaRaizIdentificada ? "identificada" : "no identificada"})`,
      },
    });

    return { ok: true };
  });
}
