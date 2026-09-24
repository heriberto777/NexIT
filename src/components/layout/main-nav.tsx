"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export interface NavLinkItem {
  href: string;
  label: string;
  primary?: boolean;
}

interface Props {
  brand: string;
  brandHref: string;
  links: NavLinkItem[];
  children?: ReactNode; // LogoutButton, DevUserSwitcher, etc.
}

// El nav de admin llegó a tener 8 links + marca + botón de sesión, todo en una sola
// fila flex sin wrap: en mobile la página entera desbordaba y "Cerrar sesión" quedaba
// fuera de la pantalla sin ninguna pista de que había que hacer scroll horizontal. A
// partir de md: se ve la fila original; debajo de md: colapsa a un menú hamburguesa.
export function MainNav({ brand, brandHref, links, children }: Props) {
  const [abierto, setAbierto] = useState(false);

  function claseLink(item: NavLinkItem) {
    return item.primary ? "text-sm font-medium text-blue-600 hover:text-blue-700" : "text-sm text-gray-600 hover:text-blue-600";
  }

  return (
    <nav className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={brandHref} className="max-w-[9rem] truncate text-sm font-semibold text-gray-900 hover:text-blue-600 sm:max-w-none">
            {brand}
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            {links.map((item) => (
              <Link key={item.href} href={item.href} className={claseLink(item)}>
                {item.label}
              </Link>
            ))}
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
          {links.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setAbierto(false)} className={claseLink(item)}>
              {item.label}
            </Link>
          ))}
          {children && <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">{children}</div>}
        </div>
      )}
    </nav>
  );
}
