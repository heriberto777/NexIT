import { z } from "zod";

export const tipoMovimientoInventarioSchema = z.enum(["ENTRADA", "SALIDA", "AJUSTE", "CONSUMO_TICKET"]);

export const guardarRepuestoSchema = z.object({
  id: z.string().cuid().optional(),
  codigo: z.string().trim().min(2, "Mínimo 2 caracteres").max(40),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(160),
  descripcion: z.string().trim().max(500).optional(),
  marca: z.string().trim().max(80).optional(),
  stockMinimo: z.coerce.number().int().min(0),
  unidadMedida: z.string().trim().min(1, "Requerido").max(40),
  costoUnidad: z.coerce.number().min(0),
  ubicacion: z.string().trim().max(120).optional(),
  // Solo aplica al crear un repuesto nuevo — en edición el stock se ajusta únicamente
  // vía movimientos (registrarMovimientoInventario), nunca escribiendo el campo directo.
  stockInicial: z.coerce.number().int().min(0).optional(),
});
export type GuardarRepuestoInput = z.infer<typeof guardarRepuestoSchema>;

// Manual desde /admin/inventario: solo ENTRADA (compra, reposición) o AJUSTE (corrección
// de conteo físico, positiva o negativa). SALIDA/CONSUMO_TICKET nacen de otros flujos
// (baja formal, consumo real en un ticket) y no se exponen aquí.
export const registrarMovimientoManualSchema = z
  .object({
    repuestoId: z.string().cuid(),
    tipo: z.enum(["ENTRADA", "AJUSTE"]),
    cantidad: z.coerce.number().int().refine((v) => v !== 0, "La cantidad no puede ser 0"),
    motivo: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.tipo !== "ENTRADA" || data.cantidad > 0, {
    message: "Una entrada debe ser una cantidad positiva",
    path: ["cantidad"],
  });
export type RegistrarMovimientoManualInput = z.infer<typeof registrarMovimientoManualSchema>;
