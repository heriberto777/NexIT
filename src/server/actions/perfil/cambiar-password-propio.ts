"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { cambiarPasswordPropioSchema } from "@/lib/zod/perfil.schema";
import type { CambiarPasswordPropioInput } from "@/lib/zod/perfil.schema";

// A diferencia de resetearPasswordUsuario.ts (admin resetea a un tercero, sin pedir la
// contraseña anterior), acá el propio usuario debe probar que conoce su contraseña
// actual antes de poder cambiarla.
export async function cambiarPasswordPropio(input: CambiarPasswordPropioInput) {
  const usuario = await requireUsuario();
  const { passwordActual, passwordNueva } = cambiarPasswordPropioSchema.parse(input);

  const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

  const coincide = await bcrypt.compare(passwordActual, registro.passwordHash);
  if (!coincide) {
    throw new Error("La contraseña actual no es correcta");
  }

  const passwordHash = await bcrypt.hash(passwordNueva, 10);
  await prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash } });

  return { ok: true };
}
