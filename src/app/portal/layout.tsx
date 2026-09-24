import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { DevUserSwitcher } from "@/components/portal/dev-user-switcher";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionActual();
  const impersonacionPermitida = process.env.ALLOW_DEV_IMPERSONATION === "true";

  // Dev-only: lista de usuarios CLIENTE para el selector rápido, sin importar quién
  // esté impersonado ahora mismo (así se puede saltar de "sin sesión válida" a un
  // Cliente real con un clic).
  const clientesDisponibles = impersonacionPermitida
    ? await prisma.usuario.findMany({
        where: { rol: "CLIENTE" },
        include: { cliente: true },
        orderBy: { nombre: "asc" },
      })
    : [];

  if (!sesion || sesion.rol !== "CLIENTE") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Portal de clientes</h1>
        <p className="text-sm text-gray-600">
          Esta sección es solo para usuarios con rol Cliente.
          {sesion && ` Tu sesión actual es ${sesion.rol}.`}
        </p>
        <Link href="/login" className="text-sm text-blue-600 underline">
          Iniciar sesión
        </Link>
        {clientesDisponibles.length > 0 && (
          <DevUserSwitcher
            usuarios={clientesDisponibles.map((u) => ({ email: u.email, nombre: u.nombre, clienteNombre: u.cliente?.nombre ?? "—" }))}
            emailActual={sesion?.email ?? ""}
          />
        )}
      </div>
    );
  }

  const cliente = sesion.clienteId ? await prisma.cliente.findUnique({ where: { id: sesion.clienteId } }) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav
        brand={cliente?.nombre ?? "Portal"}
        brandHref="/portal"
        links={[
          { href: "/portal", label: "Inicio" },
          { href: "/portal/tickets", label: "Mis tickets" },
          { href: "/portal/tickets/nuevo", label: "+ Reportar falla", primary: true },
        ]}
      >
        {clientesDisponibles.length > 0 && (
          <DevUserSwitcher
            usuarios={clientesDisponibles.map((u) => ({ email: u.email, nombre: u.nombre, clienteNombre: u.cliente?.nombre ?? "—" }))}
            emailActual={sesion.email}
          />
        )}
        <LogoutButton />
      </MainNav>
      {children}
    </div>
  );
}
