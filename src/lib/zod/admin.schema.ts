import { z } from "zod";

export const crearClienteSchema = z.object({
  nombre: z.string().trim().min(3, "Mínimo 3 caracteres").max(160),
  identificacionFiscal: z.string().trim().max(40).optional(),
});
export type CrearClienteInput = z.infer<typeof crearClienteSchema>;

export const editarClienteSchema = z.object({
  id: z.string().cuid(),
  nombre: z.string().trim().min(3, "Mínimo 3 caracteres").max(160),
  identificacionFiscal: z.string().trim().max(40).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;

export const crearSucursalSchema = z.object({
  clienteId: z.string().cuid(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  direccion: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  ciudad: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  contactoNombre: z.string().trim().max(120).optional(),
  contactoTelefono: z.string().trim().max(20).optional(),
});
export type CrearSucursalInput = z.infer<typeof crearSucursalSchema>;

export const editarSucursalSchema = z.object({
  id: z.string().cuid(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  direccion: z.string().trim().min(3, "Mínimo 3 caracteres").max(200),
  ciudad: z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  contactoNombre: z.string().trim().max(120).optional(),
  contactoTelefono: z.string().trim().max(20).optional(),
});
export type EditarSucursalInput = z.infer<typeof editarSucursalSchema>;

export const crearCategoriaActivoSchema = z.object({
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
});
export type CrearCategoriaActivoInput = z.infer<typeof crearCategoriaActivoSchema>;

export const editarCategoriaActivoSchema = z.object({
  id: z.string().cuid(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
});
export type EditarCategoriaActivoInput = z.infer<typeof editarCategoriaActivoSchema>;

export const eliminarCategoriaActivoSchema = z.object({
  id: z.string().cuid(),
});
export type EliminarCategoriaActivoInput = z.infer<typeof eliminarCategoriaActivoSchema>;

export const crearEspecialidadSchema = z.object({
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
});
export type CrearEspecialidadInput = z.infer<typeof crearEspecialidadSchema>;

// `id` usa .min(1), no .cuid(): las especialidades migradas desde el viejo
// Usuario.especialidad (texto libre) se crearon con gen_random_uuid() en la migración de
// datos, no con el cuid() que genera Prisma — un .cuid() estricto las rechazaría.
export const editarEspecialidadSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
});
export type EditarEspecialidadInput = z.infer<typeof editarEspecialidadSchema>;

export const eliminarEspecialidadSchema = z.object({
  id: z.string().min(1),
});
export type EliminarEspecialidadInput = z.infer<typeof eliminarEspecialidadSchema>;

// fechaInstalacion/fechaFinGarantia viajan como string "YYYY-MM-DD" (input type=date) o
// vacío/undefined; la conversión a Date ocurre en el Server Action, no aquí, para no
// pelear con el coerce de Zod sobre strings vacíos.
export const crearActivoSchema = z.object({
  sucursalId: z.string().cuid(),
  categoriaId: z.string().cuid(),
  marca: z.string().trim().min(1, "Requerido").max(80),
  modelo: z.string().trim().min(1, "Requerido").max(80),
  numeroSerie: z.string().trim().min(1, "Requerido").max(80),
  ubicacionEspecifica: z.string().trim().max(200).optional(),
  fechaInstalacion: z.string().optional(),
  fechaFinGarantia: z.string().optional(),
});
export type CrearActivoInput = z.infer<typeof crearActivoSchema>;

export const editarActivoSchema = z.object({
  id: z.string().cuid(),
  sucursalId: z.string().cuid(),
  categoriaId: z.string().cuid(),
  marca: z.string().trim().min(1, "Requerido").max(80),
  modelo: z.string().trim().min(1, "Requerido").max(80),
  numeroSerie: z.string().trim().min(1, "Requerido").max(80),
  ubicacionEspecifica: z.string().trim().max(200).optional(),
  fechaInstalacion: z.string().optional(),
  fechaFinGarantia: z.string().optional(),
  estado: z.enum(["ACTIVO", "EN_MANTENIMIENTO", "FUERA_DE_SERVICIO", "DADO_DE_BAJA"]),
});
export type EditarActivoInput = z.infer<typeof editarActivoSchema>;

export const crearSistemaSoftwareSchema = z.object({
  clienteId: z.string().cuid(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  proveedor: z.string().trim().max(120).optional(),
});
export type CrearSistemaSoftwareInput = z.infer<typeof crearSistemaSoftwareSchema>;

export const editarSistemaSoftwareSchema = z.object({
  id: z.string().cuid(),
  nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
  proveedor: z.string().trim().max(120).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});
export type EditarSistemaSoftwareInput = z.infer<typeof editarSistemaSoftwareSchema>;
