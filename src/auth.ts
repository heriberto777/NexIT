import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/zod/auth.schema";

// El proveedor Credentials exige estrategia JWT (no hay "cuenta OAuth verificada" que
// el adapter de Prisma pueda enlazar), así que no usamos PrismaAdapter aquí — solo
// consultamos la tabla usuarios directamente en `authorize`.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Fuera de Vercel, Auth.js no puede inferir automáticamente qué host es confiable
  // (aquí corremos en localhost:3001 porque el 3000 lo ocupa otro proyecto) — sin esto
  // rechaza toda request con "UntrustedHost". En producción real, el reverse proxy /
  // NEXTAUTH_URL siguen siendo la fuente de verdad para las cookies y callbacks.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (!usuario || usuario.estado !== "ACTIVO") return null;

        const valido = await bcrypt.compare(password, usuario.passwordHash);
        if (!valido) return null;

        // Fire-and-forget: registrar el último acceso no debe demorar ni poder tumbar
        // un login por lo demás válido si esta escritura fallara.
        void prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAccesoAt: new Date() } }).catch((error) => {
          console.error("[auth] No se pudo actualizar ultimoAccesoAt:", error);
        });

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          role: usuario.rol,
          clienteId: usuario.clienteId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.clienteId = user.clienteId;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.clienteId = token.clienteId;
      return session;
    },
  },
});
