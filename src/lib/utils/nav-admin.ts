import type { RolUsuario } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
}

// Fuente única para el nav de Admin/Coordinador — antes duplicado igual en
// admin/layout.tsx y tickets/layout.tsx, lo que hacía fácil que uno de los dos
// quedara desactualizado. `rolesPermitidos` ausente = visible para cualquiera que
// entre a este layout (ya filtrado por middleware.ts a ADMIN|COORDINADOR).
const NAV_BASE: (NavItem & { rolesPermitidos?: readonly RolUsuario[] })[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/activos", label: "Activos" },
  { href: "/admin/checklists", label: "Checklists" },
  { href: "/admin/preventivos", label: "Preventivos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/usuarios", label: "Usuarios", rolesPermitidos: ["ADMIN"] },
  { href: "/admin/configuracion", label: "Configuración", rolesPermitidos: ["ADMIN"] },
  { href: "/admin/logs", label: "Logs", rolesPermitidos: ["ADMIN"] },
  { href: "/perfil", label: "Perfil" },
];

// Antes el nav mostraba TODOS los links sin importar el rol — un Coordinador veía
// "Usuarios"/"Configuración", les daba clic, y la pantalla de destino recién ahí le
// decía "esto es solo para Admin". Filtrar acá evita el callejón sin salida.
export function navParaRol(rol: RolUsuario | undefined): NavItem[] {
  return NAV_BASE.filter((item) => !item.rolesPermitidos || (rol && item.rolesPermitidos.includes(rol))).map(({ href, label }) => ({
    href,
    label,
  }));
}
