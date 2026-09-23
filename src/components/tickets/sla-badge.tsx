import { cn } from "@/lib/utils/cn";
import type { EstadoSla } from "@/lib/utils/sla";

const CONFIG: Record<EstadoSla, { label: string; className: string }> = {
  ok: { label: "En tiempo", className: "bg-green-50 text-green-700" },
  en_riesgo: { label: "SLA en riesgo", className: "bg-amber-100 text-amber-800" },
  vencido: { label: "SLA vencido", className: "bg-red-100 text-red-800" },
};

// Solo se muestra cuando hay algo que llamar la atención — "en tiempo" es el estado
// silencioso por defecto en la tabla (se omite para no saturar de badges verdes).
export function SlaBadge({ estadoSla }: { estadoSla: EstadoSla | null }) {
  if (!estadoSla || estadoSla === "ok") return null;

  const { label, className } = CONFIG[estadoSla];
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}>
      {label}
    </span>
  );
}
