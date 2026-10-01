import { prisma } from "@/lib/prisma";
import { SistemaSoftwareForm } from "@/components/admin/sistema-software-form";

export const dynamic = "force-dynamic";

export default async function NuevoSistemaSoftwarePage() {
  const clientes = await prisma.cliente.findMany({ where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Nuevo sistema de software</h1>

      <SistemaSoftwareForm clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} />
    </div>
  );
}
