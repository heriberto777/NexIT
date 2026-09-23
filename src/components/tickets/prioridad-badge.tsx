import { cn } from "@/lib/utils/cn";

const ESTILOS: Record<string, string> = {
  CRITICA: "bg-red-600 text-white",
  ALTA: "bg-orange-500 text-white",
  MEDIA: "bg-amber-400 text-amber-950",
  BAJA: "bg-gray-200 text-gray-700",
};

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ESTILOS[prioridad] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {prioridad}
    </span>
  );
}
