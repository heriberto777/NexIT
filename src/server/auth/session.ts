import { cookies, headers } from "next/headers";
import type { RolUsuario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export interface SesionUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  clienteId: string | null;
}

// Contrato estable: el resto del código (Server Actions, páginas) depende únicamente
// de requireUsuario()/getSesionActual(), nunca de estos detalles de implementación.
interface AuthProvider {
  getSesion(): Promise<SesionUsuario | null>;
}

const ROLES_VALIDOS: RolUsuario[] = ["CLIENTE", "TECNICO", "COORDINADOR", "ADMIN"];

// Producción y desarrollo real: la sesión de Auth.js (JWT, cookie httpOnly firmada).
class RealAuthProvider implements AuthProvider {
  async getSesion(): Promise<SesionUsuario | null> {
    const sesion = await auth();
    if (!sesion?.user) return null;
    return {
      id: sesion.user.id,
      email: sesion.user.email ?? "",
      nombre: sesion.user.name ?? "",
      rol: sesion.user.role,
      clienteId: sesion.user.clienteId,
    };
  }
}

// Dev-only, gateado por ALLOW_DEV_IMPERSONATION: "impersona" un usuario ya sembrado
// sin pasar por login, para poder probar los distintos roles rápido. Por email vía
// `x-dev-user-email` (necesario cuando hay varios usuarios con el mismo rol, ej. un
// Cliente por cada empresa) o por rol vía `x-dev-user-role` (default TECNICO).
class MockDevAuthProvider implements AuthProvider {
  async getSesion(): Promise<SesionUsuario | null> {
    const [headerList, cookieList] = await Promise.all([headers(), cookies()]);

    const email = headerList.get("x-dev-user-email") ?? cookieList.get("x-dev-user-email")?.value;
    if (email) {
      const usuario = await prisma.usuario.findUnique({ where: { email } });
      if (!usuario) return null;
      return { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, clienteId: usuario.clienteId };
    }

    const rolCrudo = headerList.get("x-dev-user-role") ?? cookieList.get("x-dev-user-role")?.value;
    if (!rolCrudo) return null;
    const rol = rolCrudo.toUpperCase() as RolUsuario;

    if (!ROLES_VALIDOS.includes(rol)) {
      throw new Error(`x-dev-user-role inválido: "${rolCrudo}" (usa ${ROLES_VALIDOS.join(" | ")})`);
    }

    const usuario = await prisma.usuario.findFirst({ where: { rol }, orderBy: { nombre: "asc" } });
    if (!usuario) return null;

    return { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, clienteId: usuario.clienteId };
  }
}

const realAuthProvider = new RealAuthProvider();
const mockAuthProvider = new MockDevAuthProvider();

function impersonacionPermitida(): boolean {
  return process.env.ALLOW_DEV_IMPERSONATION === "true";
}

// La sesión real de Auth.js manda siempre que exista. La impersonación mock solo entra
// como fallback cuando NO hay sesión real Y el flag está explícitamente encendido —
// así un `npm run build`/deploy con ALLOW_DEV_IMPERSONATION sin definir (o en "false")
// nunca deja una puerta trasera abierta en producción.
export async function getSesionActual(): Promise<SesionUsuario | null> {
  const real = await realAuthProvider.getSesion();
  if (real) return real;
  if (impersonacionPermitida()) return mockAuthProvider.getSesion();
  return null;
}

export async function requireUsuario(rolRequerido?: RolUsuario): Promise<SesionUsuario> {
  const sesion = await getSesionActual();
  if (!sesion) {
    throw new Error("No autenticado — inicia sesión para continuar");
  }
  if (rolRequerido && sesion.rol !== rolRequerido) {
    throw new Error(`Esta acción requiere rol ${rolRequerido}, pero tu sesión es ${sesion.rol}`);
  }
  return sesion;
}
