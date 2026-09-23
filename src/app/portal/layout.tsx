import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { DevUserSwitcher } from "@/components/portal/dev-user-switcher";
import { LogoutButton } from "@/components/auth/logout-button";

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
      <nav className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-900">{cliente?.nombre ?? "Portal"}</span>
            <Link href="/portal" className="text-sm text-gray-600 hover:text-blue-600">
              Inicio
            </Link>
            <Link href="/portal/tickets" className="text-sm text-gray-600 hover:text-blue-600">
              Mis tickets
            </Link>
            <Link href="/portal/tickets/nuevo" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              + Reportar falla
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {clientesDisponibles.length > 0 && (
              <DevUserSwitcher
                usuarios={clientesDisponibles.map((u) => ({ email: u.email, nombre: u.nombre, clienteNombre: u.cliente?.nombre ?? "—" }))}
                emailActual={sesion.email}
              />
            )}
            <LogoutButton />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
