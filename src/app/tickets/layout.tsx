import Link from "next/link";
import type { ReactNode } from "react";
import { getSesionActual } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";

const NAV_ADMIN = [
  { href: "/tickets", label: "Tickets" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/activos", label: "Activos" },
  { href: "/admin/checklists", label: "Checklists" },
  { href: "/admin/preventivos", label: "Preventivos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/configuracion", label: "Configuración" },
];

const NAV_TECNICO = [{ href: "/tickets", label: "Tickets" }];

// /tickets es la pantalla de aterrizaje del técnico (su "home") y también el listado
// que Admin/Coordinador visitan desde su propio nav — sin este layout quedaban sin
// barra de navegación ni botón de cerrar sesión al llegar aquí (la protección por rol
// ya la hace middleware.ts, así que aquí solo decidimos qué nav mostrar).
export default async function TicketsLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionActual();
  const nav = sesion?.rol === "TECNICO" ? NAV_TECNICO : NAV_ADMIN;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-900">NexIT</span>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-gray-600 hover:text-blue-600">
                {item.label}
              </Link>
            ))}
          </div>
          <LogoutButton />
        </div>
      </nav>
      {children}
    </div>
  );
}
