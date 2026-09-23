import { z } from "zod";
import { prioridadSchema } from "@/lib/zod/ticket.schema";
import { optionalCuid } from "@/lib/zod/shared";

export const frecuenciaMantenimientoSchema = z.enum(["SEMANAL", "MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]);
export const estadoPlanPreventivoSchema = z.enum(["ACTIVO", "PAUSADO"]);

// Exactamente uno de activoId/sucursalId: un plan de un equipo específico usa su
// checklist por categoría; un plan a nivel de sede (ej. inspección general) no tiene
// un único activo/checklist asociado.
export const guardarPlanPreventivoSchema = z
  .object({
    id: z.string().cuid().optional(),
    titulo: z.string().trim().min(3, "Mínimo 3 caracteres").max(160),
    descripcion: z.string().trim().max(500).optional(),
    activoId: optionalCuid(),
    sucursalId: optionalCuid(),
    frecuencia: frecuenciaMantenimientoSchema,
    proximaFecha: z.string().min(1, "Requerido"),
    tecnicoAsignadoId: optionalCuid(),
    prioridad: prioridadSchema,
  })
  .refine((data) => Boolean(data.activoId) !== Boolean(data.sucursalId), {
    message: "Selecciona un Activo o una Sucursal (no ambos)",
    path: ["activoId"],
  });
export type GuardarPlanPreventivoInput = z.infer<typeof guardarPlanPreventivoSchema>;

export const cambiarEstadoPlanPreventivoSchema = z.object({
  id: z.string().cuid(),
  estado: estadoPlanPreventivoSchema,
});
export type CambiarEstadoPlanPreventivoInput = z.infer<typeof cambiarEstadoPlanPreventivoSchema>;

// Sin default fijo aquí a propósito: cuando no se envía, el service resuelve el
// default desde ConfiguracionSistema.diasAnticipacionPreventivos (configurable en
// /admin/configuracion) en vez de un número hardcodeado.
export const generarTicketsPreventivosSchema = z.object({
  diasVentana: z.number().int().min(0).max(60).optional(),
});
export type GenerarTicketsPreventivosInput = z.infer<typeof generarTicketsPreventivosSchema>;
