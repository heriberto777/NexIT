import type { ReactNode } from "react";
import { getSesionActual } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";
import { navParaRol } from "@/lib/utils/nav-admin";

const NAV_TECNICO = [
  { href: "/tickets", label: "Tickets" },
  { href: "/perfil", label: "Perfil" },
];

// /tickets es la pantalla de aterrizaje del técnico (su "home") y también el listado
// que Admin/Coordinador visitan desde su propio nav — sin este layout quedaban sin
// barra de navegación ni botón de cerrar sesión al llegar aquí (la protección por rol
// ya la hace middleware.ts, así que aquí solo decidimos qué nav mostrar).
export default async function TicketsLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionActual();
  const esTecnico = sesion?.rol === "TECNICO";
  const nav = esTecnico ? NAV_TECNICO : navParaRol(sesion?.rol);

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav brand="NexIT" brandHref={esTecnico ? "/tickets" : "/admin"} links={nav}>
        <LogoutButton />
      </MainNav>
      {children}
    </div>
  );
}
