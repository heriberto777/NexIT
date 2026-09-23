import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils/cn";
import { RepuestoForm } from "@/components/admin/repuesto-form";
import { RegistrarMovimientoModal } from "@/components/admin/registrar-movimiento-modal";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ repuestoId: string }>;
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });

const ESTILOS_TIPO: Record<string, string> = {
  ENTRADA: "bg-green-100 text-green-800",
  SALIDA: "bg-gray-200 text-gray-700",
  AJUSTE: "bg-amber-100 text-amber-800",
  CONSUMO_TICKET: "bg-blue-100 text-blue-800",
};

export default async function RepuestoDetailPage({ params }: PageProps) {
  const { repuestoId } = await params;

  const repuesto = await prisma.repuesto.findUnique({ where: { id: repuestoId } });
  if (!repuesto) notFound();

  const movimientos = await prisma.movimientoInventario.findMany({
    where: { repuestoId },
    include: { usuario: true, ticketRepuesto: { include: { ticket: true } } },
    orderBy: { fecha: "asc" },
  });

  const kardexAscendente = movimientos.reduce<Array<(typeof movimientos)[number] & { saldo: number }>>((acc, m) => {
    const saldoPrevio = acc.at(-1)?.saldo ?? 0;
    return [...acc, { ...m, saldo: saldoPrevio + m.cantidad }];
  }, []);
  const kardex = [...kardexAscendente].reverse();

  const critico = repuesto.stockActual <= repuesto.stockMinimo;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/admin/inventario" className="text-sm text-blue-600 underline">
        ← Volver a inventario
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{repuesto.nombre}</h1>
          <p className="text-sm text-gray-500">{repuesto.codigo}</p>
          <p className="mt-1 text-sm">
            Stock actual:{" "}
            <span className={cn("font-semibold", critico ? "text-red-700" : "text-gray-800")}>{repuesto.stockActual}</span>{" "}
            <span className="text-gray-400">
              / mín. {repuesto.stockMinimo} {repuesto.unidadMedida}
            </span>
            {critico && (
              <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Stock crítico</span>
            )}
          </p>
        </div>
        <RegistrarMovimientoModal repuestoId={repuesto.id} />
      </div>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">Editar datos del repuesto</summary>
        <div className="mt-3">
          <RepuestoForm
            modoEdicion
            valoresIniciales={{
              id: repuesto.id,
              codigo: repuesto.codigo,
              nombre: repuesto.nombre,
              descripcion: repuesto.descripcion ?? undefined,
              marca: repuesto.marca ?? undefined,
              stockMinimo: repuesto.stockMinimo,
              unidadMedida: repuesto.unidadMedida,
              costoUnidad: repuesto.costoUnidad.toNumber(),
              ubicacion: repuesto.ubicacion ?? undefined,
            }}
          />
        </div>
      </details>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Kardex — historial de movimientos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-2 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">Cantidad</th>
                <th className="px-2 py-2 font-medium">Saldo</th>
                <th className="px-2 py-2 font-medium">Motivo</th>
                <th className="px-2 py-2 font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kardex.map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-2 text-gray-500">{FORMATO_FECHA.format(m.fecha)}</td>
                  <td className="px-2 py-2">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", ESTILOS_TIPO[m.tipo])}>
                      {m.tipo.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className={cn("px-2 py-2 font-medium", m.cantidad >= 0 ? "text-green-700" : "text-red-700")}>
                    {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                  </td>
                  <td className="px-2 py-2 text-gray-800">{m.saldo}</td>
                  <td className="px-2 py-2 text-gray-600">
                    {m.motivo ?? "—"}
                    {m.ticketRepuesto && (
                      <>
                        {" "}
                        <Link href={`/tickets/${m.ticketRepuesto.ticket.id}`} className="text-blue-600 hover:underline">
                          #{m.ticketRepuesto.ticket.numeroTicket}
                        </Link>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-500">{m.usuario.nombre}</td>
                </tr>
              ))}
              {kardex.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-sm text-gray-400">
                    Sin movimientos registrados todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
