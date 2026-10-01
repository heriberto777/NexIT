"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";

export interface NavLinkItem {
  href: string;
  label: string;
  primary?: boolean;
}

// Un grupo agrupa links relacionados bajo un desplegable (desktop) o una sección de
// acordeón (mobile) — ver nav-admin.ts para el motivo (12 ítems planos ya no entraban
// ni en desktop angosto ni en tablet).
export interface NavGroupItem {
  label: string;
  items: NavLinkItem[];
}
export type NavEntry = NavLinkItem | NavGroupItem;

function esGrupo(entry: NavEntry): entry is NavGroupItem {
  return "items" in entry;
}

interface Props {
  brand: string;
  brandHref: string;
  links: NavEntry[];
  children?: ReactNode; // LogoutButton, DevUserSwitcher, etc.
}

// El nav de admin llegó a tener 8 links + marca + botón de sesión, todo en una sola
// fila flex sin wrap: en mobile la página entera desbordaba y "Cerrar sesión" quedaba
// fuera de la pantalla sin ninguna pista de que había que hacer scroll horizontal. A
// partir de md: se ve la fila original; debajo de md: colapsa a un menú hamburguesa.
// Más tarde el nav de Admin creció a 12 ítems y se agruparon en desplegables (ver
// nav-admin.ts) — acá solo cambia CÓMO se renderiza cada entrada, plana o agrupada.
export function MainNav({ brand, brandHref, links, children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  // "/admin" y "/portal" son a la vez la ruta del propio link Y un prefijo literal de
  // TODOS sus hermanos ("/admin/clientes", "/portal/tickets", ...) — sin este caso
  // especial, "Dashboard"/"Inicio" quedarían marcados activos en cualquier subpágina.
  // El resto de los links sí usa match por prefijo: querés que "Tickets" siga resaltado
  // en /tickets/nuevo o /tickets/:id, no solo en /tickets exacto.
  function esActivo(href: string): boolean {
    if (href === "/admin" || href === "/portal") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function grupoActivo(grupo: NavGroupItem): boolean {
    return grupo.items.some((item) => esActivo(item.href));
  }

  function claseLink(item: NavLinkItem) {
    if (item.primary) return "text-sm font-medium text-blue-600 hover:text-blue-700";
    return esActivo(item.href)
      ? "rounded-lg bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700 -mx-2 -my-1"
      : "text-sm text-gray-600 hover:text-blue-600";
  }

  return (
    <nav className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={brandHref} className="max-w-[9rem] truncate text-sm font-semibold text-gray-900 hover:text-blue-600 sm:max-w-none">
            {brand}
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            {links.map((entry) =>
              esGrupo(entry) ? (
                <DesktopDropdown key={entry.label} grupo={entry} activo={grupoActivo(entry)} claseLink={claseLink} />
              ) : (
                <Link key={entry.href} href={entry.href} className={claseLink(entry)}>
                  {entry.label}
                </Link>
              ),
            )}
          </div>
        </div>
        <div className="hidden items-center gap-3 md:flex">{children}</div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="shrink-0 text-gray-600 md:hidden"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        >
          {abierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {abierto && (
        <div className="mx-auto mt-3 flex max-w-5xl flex-col gap-3 border-t border-gray-100 pt-3 md:hidden">
          {links.map((entry) =>
            esGrupo(entry) ? (
              <MobileAccordion
                key={entry.label}
                grupo={entry}
                activo={grupoActivo(entry)}
                claseLink={claseLink}
                onNavigate={() => setAbierto(false)}
              />
            ) : (
              <Link key={entry.href} href={entry.href} onClick={() => setAbierto(false)} className={claseLink(entry)}>
                {entry.label}
              </Link>
            ),
          )}
          {children && <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">{children}</div>}
        </div>
      )}
    </nav>
  );
}

// Desplegable de escritorio: se cierra solo con un clic afuera, con Escape, o al
// navegar — sin esto quedaría abierto tapando contenido hasta el próximo clic manual
// sobre el mismo botón.
function DesktopDropdown({
  grupo,
  activo,
  claseLink,
}: {
  grupo: NavGroupItem;
  activo: boolean;
  claseLink: (item: NavLinkItem) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    queueMicrotask(() => setAbierto(false));
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex items-center gap-1 text-sm ${activo ? "font-semibold text-blue-700" : "text-gray-600 hover:text-blue-600"}`}
        aria-expanded={abierto}
      >
        {grupo.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
          {grupo.items.map((item) => (
            <Link key={item.href} href={item.href} className={`block px-3 py-1.5 ${claseLink(item)}`} onClick={() => setAbierto(false)}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Sección de acordeón para el menú hamburguesa de mobile — arranca expandida si la
// ruta actual ya está dentro del grupo, para que llegar directo a /admin/activos no
// obligue a "adivinar" en qué grupo buscarlo.
function MobileAccordion({
  grupo,
  activo,
  claseLink,
  onNavigate,
}: {
  grupo: NavGroupItem;
  activo: boolean;
  claseLink: (item: NavLinkItem) => string;
  onNavigate: () => void;
}) {
  const [expandido, setExpandido] = useState(activo);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className={`flex w-full items-center justify-between text-sm ${activo ? "font-semibold text-blue-700" : "text-gray-600"}`}
        aria-expanded={expandido}
      >
        {grupo.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandido ? "rotate-180" : ""}`} />
      </button>
      {expandido && (
        <div className="mt-2 flex flex-col gap-2 border-l border-gray-100 pl-3">
          {grupo.items.map((item) => (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={claseLink(item)}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
