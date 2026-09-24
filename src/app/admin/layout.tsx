import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/activos", label: "Activos" },
  { href: "/admin/checklists", label: "Checklists" },
  { href: "/admin/preventivos", label: "Preventivos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav brand="NexIT Admin" brandHref="/admin" links={NAV}>
        <LogoutButton />
      </MainNav>
      {children}
    </div>
  );
}
