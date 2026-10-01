import type { RolUsuario } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
}

// Un `NavEntry` es o un link suelto (Dashboard, Tickets — las pantallas de uso más
// frecuente, nunca escondidas en un desplegable) o un grupo de links relacionados.
// MainNav decide cómo renderizar cada uno según el tipo de dispositivo.
export interface NavGroup {
  label: string;
  items: NavItem[];
}
export type NavEntry = NavItem | NavGroup;

export function esGrupo(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

interface NavItemConfig extends NavItem {
  rolesPermitidos?: readonly RolUsuario[];
}
interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
  rolesPermitidos?: readonly RolUsuario[];
}
type NavEntryConfig = NavItemConfig | NavGroupConfig;

// Fuente única para el nav de Admin/Coordinador — antes duplicado igual en
// admin/layout.tsx y tickets/layout.tsx, lo que hacía fácil que uno de los dos
// quedara desactualizado. `rolesPermitidos` ausente = visible para cualquiera que
// entre a este layout (ya filtrado por middleware.ts a ADMIN|COORDINADOR). Agrupado
// por dominio — la barra plana de 12 ítems no entraba ni en desktop angosto ni en
// tablet, y el menú hamburguesa de mobile quedaba como una lista larga sin estructura.
const NAV_BASE: NavEntryConfig[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  {
    label: "Clientes",
    items: [
      { href: "/admin/clientes", label: "Clientes" },
      { href: "/admin/contactos-pendientes", label: "Contactos pendientes" },
    ],
  },
  {
    label: "Mantenimiento",
    items: [
      { href: "/admin/activos", label: "Activos" },
      { href: "/admin/checklists", label: "Checklists" },
      { href: "/admin/preventivos", label: "Preventivos" },
      { href: "/admin/inventario", label: "Inventario" },
    ],
  },
  {
    label: "Sistema",
    rolesPermitidos: ["ADMIN"],
    items: [
      { href: "/admin/usuarios", label: "Usuarios" },
      { href: "/admin/configuracion", label: "Configuración" },
      { href: "/admin/logs", label: "Logs" },
    ],
  },
  { href: "/perfil", label: "Perfil" },
];

// Antes el nav mostraba TODOS los links sin importar el rol — un Coordinador veía
// "Usuarios"/"Configuración", les daba clic, y la pantalla de destino recién ahí le
// decía "esto es solo para Admin". Filtrar acá evita el callejón sin salida. Un grupo
// entero desaparece si nadie de sus ítems queda visible para el rol actual (hoy solo
// pasa con "Sistema" para Coordinador).
export function navParaRol(rol: RolUsuario | undefined): NavEntry[] {
  const permitido = (roles?: readonly RolUsuario[]) => !roles || (rol && roles.includes(rol));

  return NAV_BASE.filter((entry) => permitido(entry.rolesPermitidos))
    .map((entry): NavEntry => ("items" in entry ? { label: entry.label, items: entry.items } : { href: entry.href, label: entry.label }))
    .filter((entry) => !esGrupo(entry) || entry.items.length > 0);
}
