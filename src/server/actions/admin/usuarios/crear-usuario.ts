"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { crearUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { CrearUsuarioInput } from "@/lib/zod/usuario.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function crearUsuario(input: CrearUsuarioInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede crear usuarios`);
  }

  const { nombre, email, rol, password, clienteId, especialidad } = crearUsuarioSchema.parse(input);

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw new Error("Ya existe un usuario con ese correo");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const nuevo = await prisma.usuario.create({
    data: {
      nombre,
      email,
      passwordHash,
      rol,
      clienteId: rol === "CLIENTE" ? clienteId : undefined,
      especialidad: rol === "TECNICO" ? especialidad : undefined,
    },
  });

  return { id: nuevo.id };
}
