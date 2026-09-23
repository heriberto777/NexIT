import { NextResponse } from "next/server";
import { auth } from "@/auth";

// El técnico no tiene un prefijo de URL propio (su pantalla vive en /tickets/[id]/ejecucion,
// dentro del route group (tecnico) que no aparece en la URL) — así que la regla real es
// "todo /tickets/* es para staff", no "/tecnico/*" como sugiere la nomenclatura genérica.
const REGLAS: { prefix: string; roles: readonly string[] }[] = [
  { prefix: "/admin", roles: ["ADMIN", "COORDINADOR"] },
  { prefix: "/portal", roles: ["CLIENTE"] },
  { prefix: "/tickets", roles: ["ADMIN", "COORDINADOR", "TECNICO"] },
];

const RUTAS_PROTEGIDAS = REGLAS.map((r) => r.prefix);

function esRutaProtegida(pathname: string): boolean {
  return RUTAS_PROTEGIDAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function tieneCookieImpersonacion(req: Parameters<Parameters<typeof auth>[0]>[0]): boolean {
  return Boolean(req.cookies.get("x-dev-user-email")?.value || req.cookies.get("x-dev-user-role")?.value);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!esRutaProtegida(pathname)) return NextResponse.next();

  if (req.auth?.user) {
    const rol = req.auth.user.role;
    const regla = REGLAS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
    if (regla && rol && !regla.roles.includes(rol)) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  // Sin sesión real de Auth.js: el middleware corre en el Edge Runtime y no puede
  // consultar Prisma para validar A QUÉ rol apunta la cookie mock — esa verificación
  // (y el mensaje de "acceso restringido") ya la hacen los layouts de /admin y /portal.
  // Aquí solo decidimos si dejamos pasar la impersonación o exigimos login real.
  if (process.env.ALLOW_DEV_IMPERSONATION === "true" && tieneCookieImpersonacion(req)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/tickets/:path*"],
};
