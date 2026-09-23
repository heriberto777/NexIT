import { cn } from "@/lib/utils/cn";

const ESTILOS: Record<string, string> = {
  ABIERTO: "bg-blue-100 text-blue-800",
  ASIGNADO: "bg-indigo-100 text-indigo-800",
  EN_DIAGNOSTICO: "bg-purple-100 text-purple-800",
  ESPERANDO_REPUESTO: "bg-amber-100 text-amber-800",
  EN_EJECUCION: "bg-cyan-100 text-cyan-800",
  ESPERANDO_VALIDACION: "bg-orange-100 text-orange-800",
  RESUELTO: "bg-green-100 text-green-800",
  REABIERTO: "bg-red-100 text-red-800",
  CERRADO: "bg-gray-200 text-gray-700",
  CANCELADO: "bg-gray-100 text-gray-500 line-through",
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ESTILOS[estado] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {estado.replaceAll("_", " ")}
    </span>
  );
}
