import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";

// El grupo de rutas (tecnico) no aparece en la URL, pero SÍ crea su propio árbol de
// layouts independiente de src/app/tickets/layout.tsx — aunque ambos compartan el
// prefijo /tickets/... en la URL, Next.js no anida uno dentro del otro. Sin esto, el
// wizard de ejecución (/tickets/[id]/ejecucion) quedaba sin forma de cerrar sesión.
export default function TecnicoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-900">NexIT</span>
          <Link href="/tickets" className="text-sm text-gray-600 hover:text-blue-600">
            Tickets
          </Link>
        </div>
        <LogoutButton />
      </nav>
      {children}
    </div>
  );
}
