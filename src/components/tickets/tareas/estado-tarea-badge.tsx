import { cn } from "@/lib/utils/cn";

const ESTILOS: Record<string, string> = {
  PENDIENTE: "bg-gray-100 text-gray-700",
  EN_PROGRESO: "bg-amber-100 text-amber-800",
  COMPLETADA: "bg-green-100 text-green-800",
  CANCELADA: "bg-gray-100 text-gray-500 line-through",
};

const ETIQUETAS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export function EstadoTareaBadge({ estado }: { estado: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ESTILOS[estado] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {ETIQUETAS[estado] ?? estado}
    </span>
  );
}
