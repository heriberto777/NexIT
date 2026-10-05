import type { ReactNode } from "react";
import { getSesionActual } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { NAV_TECNICO, navParaRol } from "@/lib/utils/nav-admin";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// /tickets es la pantalla de aterrizaje del técnico (su "home") y también el listado
// que Admin/Coordinador visitan desde su propio nav — sin este layout quedaban sin
// barra de navegación ni botón de cerrar sesión al llegar aquí (la protección por rol
// ya la hace middleware.ts, así que aquí solo decidimos qué nav mostrar).
export default async function TicketsLayout({ children }: { children: ReactNode }) {
  const [sesion, config] = await Promise.all([getSesionActual(), obtenerConfiguracion()]);
  const esTecnico = sesion?.rol === "TECNICO";
  const nav = esTecnico ? NAV_TECNICO : navParaRol(sesion?.rol);

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav brand={config.empresaNombre} brandHref={esTecnico ? "/tickets" : "/admin"} links={nav}>
        <NotificationBell />
        <LogoutButton />
      </MainNav>
      {children}
    </div>
  );
}
