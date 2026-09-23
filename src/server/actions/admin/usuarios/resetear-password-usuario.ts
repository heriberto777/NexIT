"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { resetearPasswordUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { ResetearPasswordUsuarioInput } from "@/lib/zod/usuario.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

// Genera una contraseña temporal aleatoria en vez de pedirle una al admin — evita que
// termine escribiendo la misma "Password123!" para todo el mundo. Se muestra UNA sola
// vez en la respuesta; NexIT no la guarda en texto plano en ningún otro lugar.
function generarPasswordTemporal(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 caracteres, alfanumérico URL-safe
}

export async function resetearPasswordUsuario(input: ResetearPasswordUsuarioInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede resetear contraseñas`);
  }

  const { id } = resetearPasswordUsuarioSchema.parse(input);

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);

  await prisma.usuario.update({ where: { id }, data: { passwordHash } });

  return { passwordTemporal };
}
