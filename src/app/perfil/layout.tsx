import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { MainNav } from "@/components/layout/main-nav";
import { navParaRol } from "@/lib/utils/nav-admin";

const NAV_TECNICO = [
  { href: "/tickets", label: "Tickets" },
  { href: "/perfil", label: "Perfil" },
];

// /perfil es accesible para los 4 roles y no vive bajo /admin, /tickets ni /portal, así
// que necesita su propio layout que reconstruya el mismo nav que el usuario ve en su
// sección habitual — de otro modo llegaría a una página sin barra de navegación.
export default async function PerfilLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionActual();

  if (sesion?.rol === "CLIENTE") {
    const cliente = sesion.clienteId ? await prisma.cliente.findUnique({ where: { id: sesion.clienteId } }) : null;
    return (
      <div className="min-h-screen bg-gray-50">
        <MainNav
          brand={cliente?.nombre ?? "Portal"}
          brandHref="/portal"
          links={[
            { href: "/portal", label: "Inicio" },
            { href: "/portal/tickets", label: "Mis tickets" },
            { href: "/perfil", label: "Perfil" },
          ]}
        >
          <LogoutButton />
        </MainNav>
        {children}
      </div>
    );
  }

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
