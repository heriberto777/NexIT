import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Las tablas anchas no tenían ninguna pista visual en mobile de que hay más
// columnas a la derecha (SLA, Técnico, Creado, acciones quedaban cortadas sin que
// el usuario supiera que debía deslizar) — el degradado da esa pista sin necesitar
// JS que detecte la posición real del scroll.
export function TableScroll({ children, bordered = true, className }: { children: ReactNode; bordered?: boolean; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className={bordered ? "overflow-x-auto rounded-xl border border-gray-200 bg-white" : "overflow-x-auto"}>
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:hidden" />
    </div>
  );
}
