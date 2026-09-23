import { RepuestoForm } from "@/components/admin/repuesto-form";

export default function NuevoRepuestoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nuevo repuesto</h1>
      <RepuestoForm />
    </div>
  );
}
