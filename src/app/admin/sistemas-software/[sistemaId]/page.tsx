import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SistemaSoftwareForm } from "@/components/admin/sistema-software-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ sistemaId: string }>;
}

export default async function SistemaSoftwareDetailPage({ params }: PageProps) {
  const { sistemaId } = await params;

  const [sistema, clientes] = await Promise.all([
    prisma.sistemaSoftware.findUnique({ where: { id: sistemaId }, include: { cliente: true } }),
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  if (!sistema) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">{sistema.nombre}</h1>

      <SistemaSoftwareForm
        modoEdicion
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        clienteNombre={sistema.cliente.nombre}
        valoresIniciales={{
          id: sistema.id,
          nombre: sistema.nombre,
          proveedor: sistema.proveedor ?? undefined,
          estado: sistema.estado,
        }}
      />
    </div>
  );
}
