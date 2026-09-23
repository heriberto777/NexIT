import type { RolUsuario } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Extiende los tipos de Auth.js para que session.user y el JWT lleven los campos que
// el resto de la app ya asume (id, role, clienteId) — sin esto, TypeScript solo conoce
// name/email/image por defecto.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RolUsuario;
      clienteId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: RolUsuario;
    clienteId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: RolUsuario;
    clienteId: string | null;
  }
}
