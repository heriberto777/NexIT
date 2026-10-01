import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getSesionActual } from "@/server/auth/session";
import { navParaRol } from "@/lib/utils/nav-admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionActual();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav brand="NexIT Admin" brandHref="/admin" links={navParaRol(sesion?.rol)}>
        <NotificationBell />
        <LogoutButton />
      </MainNav>
      {children}
    </div>
  );
}
