import { z } from "zod";
import { optionalCuid } from "@/lib/zod/shared";

export const rolUsuarioSchema = z.enum(["ADMIN", "COORDINADOR", "TECNICO", "CLIENTE"]);
export const estadoUsuarioSchema = z.enum(["ACTIVO", "INACTIVO"]);

// clienteId es obligatorio cuando rol=CLIENTE (un cliente sin empresa asociada no
// podría filtrar nada en el Portal) y no debe venir en cualquier otro rol.
export const crearUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
    email: z.string().trim().email("Correo inválido"),
    rol: rolUsuarioSchema,
    password: z.string().min(8, "Mínimo 8 caracteres").max(100),
    clienteId: optionalCuid(),
    especialidad: z.string().trim().max(120).optional(),
  })
  .refine((data) => (data.rol === "CLIENTE" ? Boolean(data.clienteId) : true), {
    message: "Selecciona la empresa del cliente",
    path: ["clienteId"],
  });
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const editarUsuarioSchema = z
  .object({
    id: z.string().cuid(),
    nombre: z.string().trim().min(2, "Mínimo 2 caracteres").max(120),
    email: z.string().trim().email("Correo inválido"),
    rol: rolUsuarioSchema,
    clienteId: optionalCuid(),
    especialidad: z.string().trim().max(120).optional(),
  })
  .refine((data) => (data.rol === "CLIENTE" ? Boolean(data.clienteId) : true), {
    message: "Selecciona la empresa del cliente",
    path: ["clienteId"],
  });
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

export const cambiarEstadoUsuarioSchema = z.object({
  id: z.string().cuid(),
  estado: estadoUsuarioSchema,
});
export type CambiarEstadoUsuarioInput = z.infer<typeof cambiarEstadoUsuarioSchema>;

export const resetearPasswordUsuarioSchema = z.object({
  id: z.string().cuid(),
});
export type ResetearPasswordUsuarioInput = z.infer<typeof resetearPasswordUsuarioSchema>;
