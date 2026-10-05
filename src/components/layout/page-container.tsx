import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Tope de ancho centralizado — antes cada página repetía "mx-auto max-w-Xxl" a mano
// (~35 archivos, cada uno con su propio valor). "lg"/"xl" usan min(rem, vw) en vez de
// un breakpoint fijo de Tailwind: crecen con el viewport en vez de topar siempre a un
// mismo ancho en píxeles, sin perder el gutter de mobile (en <640px el vw manda y da
// prácticamente el mismo resultado que el px-4 de siempre). "md" se queda fijo a
// propósito para formularios angostos, donde más ancho no ayuda a la legibilidad.
// Exportado para que main-nav.tsx use el mismo ancho que "lg" — si quedaran
// desincronizados, el contenido y la barra de navegación dejarían de estar alineados.
export const TAMANOS = {
  md: "max-w-3xl",
  lg: "max-w-[min(90rem,94vw)]",
  xl: "max-w-[min(100rem,96vw)]",
} as const;

interface Props {
  size?: keyof typeof TAMANOS;
  className?: string;
  children: ReactNode;
}

export function PageContainer({ size = "lg", className, children }: Props) {
  return <div className={cn("mx-auto px-4 py-6", TAMANOS[size], className)}>{children}</div>;
}
