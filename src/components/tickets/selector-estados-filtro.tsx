"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SelectorEtiquetas } from "@/components/ui/selector-etiquetas";

const ETIQUETA_ESTADO: Record<string, string> = {
  ABIERTO: "Abierto",
  ASIGNADO: "Asignado",
  EN_DIAGNOSTICO: "En diagnóstico",
  ESPERANDO_REPUESTO: "Esperando repuesto",
  EN_EJECUCION: "En ejecución",
  ESPERANDO_VALIDACION: "Esperando validación",
  RESUELTO: "Resuelto",
  REABIERTO: "Reabierto",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
};
const OPCIONES = Object.entries(ETIQUETA_ESTADO).map(([id, nombre]) => ({ id, nombre }));

// Mismo componente de chips + "+ Agregar" que ya usa Colaboradores/Especialidades —
// acá no llama a un Server Action, sino que navega de inmediato con el estado nuevo en
// la URL (vía router.push), preservando el resto de los filtros ya aplicados. El form
// GET de /tickets de todas formas repite estos valores como inputs ocultos (ver
// page.tsx) para que al tocar "Filtrar" por otro campo no se pierda esta selección.
export function SelectorEstadosFiltro() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seleccionadas = searchParams.getAll("estado");

  function onChange(ids: string[]) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("estado");
    for (const id of ids) sp.append("estado", id);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return <SelectorEtiquetas seleccionadas={seleccionadas} opciones={OPCIONES} onChange={onChange} />;
}
