import { RepuestoForm } from "@/components/admin/repuesto-form";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

export default async function NuevoRepuestoPage() {
  const config = await obtenerConfiguracion();
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nuevo repuesto</h1>
      <RepuestoForm monedaSimbolo={config.monedaSimbolo} />
    </div>
  );
}
