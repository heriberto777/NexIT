"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearCotizacion } from "@/server/actions/tickets/crear-cotizacion";
import { guardarRepuesto } from "@/server/actions/admin/guardar-repuesto";
import { formatCurrency } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";

export interface ProductoCotizable {
  id: string;
  nombre: string;
  costoUnidad: number;
  unidadMedida: string;
}

interface Props {
  ticketId: string;
  monedaSimbolo: string;
  productos: ProductoCotizable[];
  // Mismo rol que ya puede crear repuestos en /admin/inventario (guardar-repuesto.ts) —
  // un técnico puede cotizar sobre el catálogo existente, pero no inventar productos
  // nuevos con el precio que quiera, para que el monto siga saliendo de una base real.
  puedeCrearProducto: boolean;
}

// Dos modos: "PRODUCTO" ancla el monto al precio real del catálogo (el servidor lo
// recalcula, acá solo se muestra el preview) — para cuando lo que hace falta es un
// producto/accesorio puntual, esté o no en stock. "LIBRE" es el modo anterior, para
// costos que no son un producto (ej. horas de mano de obra adicional). Ver análisis
// "¿de dónde sale el monto de la cotización?".
export function SolicitarCotizacionModal({ ticketId, monedaSimbolo, productos: productosIniciales, puedeCrearProducto }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"PRODUCTO" | "LIBRE">("PRODUCTO");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [productos, setProductos] = useState(productosIniciales);
  const [repuestoId, setRepuestoId] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [creandoProducto, setCreandoProducto] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("unidad");
  const [nuevoCosto, setNuevoCosto] = useState("");
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  const productoSeleccionado = productos.find((p) => p.id === repuestoId);
  const montoCalculado = productoSeleccionado ? productoSeleccionado.costoUnidad * cantidad : 0;

  function cerrarYLimpiar() {
    setOpen(false);
    setError(null);
    setModo("PRODUCTO");
    setRepuestoId("");
    setCantidad(1);
    setMonto("");
    setDescripcion("");
    setCreandoProducto(false);
  }

  async function enviar() {
    setError(null);
    if (modo === "PRODUCTO" && !repuestoId) {
      setError("Elegí un producto del catálogo");
      return;
    }
    if (modo === "LIBRE" && (!monto || descripcion.trim().length < 10)) {
      setError("Completá el monto y una descripción de al menos 10 caracteres");
      return;
    }
    setEnviando(true);
    const resultado = await crearCotizacion(
      modo === "PRODUCTO"
        ? { tipo: "PRODUCTO", ticketId, repuestoId, cantidad }
        : { tipo: "LIBRE", ticketId, monto: Number(monto), descripcion },
    );
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    cerrarYLimpiar();
    router.refresh();
  }

  // Reutiliza la misma Server Action que ya usa /admin/inventario/nuevo — no es un
  // producto "falso" solo para cotizar: queda en el catálogo real, con stock en 0, listo
  // para sumarle stock de verdad cuando llegue del proveedor y consumirlo normalmente
  // desde el wizard (registrar-repuesto.ts) — así se cierra el círculo que hoy falta.
  async function crearProductoRapido() {
    setError(null);
    if (nuevoCodigo.trim().length < 2 || nuevoNombre.trim().length < 2 || !nuevoCosto) {
      setError("Completá código, nombre y costo del producto");
      return;
    }
    setGuardandoProducto(true);
    const resultado = await guardarRepuesto({
      codigo: nuevoCodigo.trim(),
      nombre: nuevoNombre.trim(),
      unidadMedida: nuevaUnidad.trim() || "unidad",
      costoUnidad: Number(nuevoCosto),
      stockMinimo: 0,
    });
    setGuardandoProducto(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    const nuevo: ProductoCotizable = {
      id: resultado.data.id,
      nombre: nuevoNombre.trim(),
      costoUnidad: Number(nuevoCosto),
      unidadMedida: nuevaUnidad.trim() || "unidad",
    };
    setProductos((prev) => [...prev, nuevo]);
    setRepuestoId(nuevo.id);
    setCreandoProducto(false);
    setNuevoCodigo("");
    setNuevoNombre("");
    setNuevoCosto("");
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full">
        Solicitar cotización adicional
      </Button>

      <Modal open={open} onClose={cerrarYLimpiar} title="Solicitar cotización">
        <div className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setModo("PRODUCTO")}
              className={`flex-1 rounded-md py-1.5 font-medium ${modo === "PRODUCTO" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Un producto
            </button>
            <button
              type="button"
              onClick={() => setModo("LIBRE")}
              className={`flex-1 rounded-md py-1.5 font-medium ${modo === "LIBRE" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              Otro costo
            </button>
          </div>

          {modo === "PRODUCTO" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Producto</label>
                <ComboboxBuscable
                  value={repuestoId}
                  onChange={setRepuestoId}
                  placeholder="Selecciona un producto del catálogo"
                  emptyMessage="No hay productos en el catálogo"
                  options={productos.map((p) => ({
                    value: p.id,
                    label: `${p.nombre} — ${formatCurrency(p.costoUnidad, monedaSimbolo)} / ${p.unidadMedida}`,
                  }))}
                />
              </div>

              <div className="w-24">
                <label className="mb-1 block text-sm font-medium text-gray-700">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {productoSeleccionado && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Monto a cotizar: <span className="font-semibold text-gray-900">{formatCurrency(montoCalculado, monedaSimbolo)}</span>{" "}
                  <span className="text-xs text-gray-400">(precio de catálogo, no editable)</span>
                </p>
              )}

              {puedeCrearProducto && !creandoProducto && (
                <button type="button" onClick={() => setCreandoProducto(true)} className="text-xs text-blue-600 underline">
                  + El producto que necesito no está en la lista
                </button>
              )}

              {puedeCrearProducto && creandoProducto && (
                <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-600">Nuevo producto del catálogo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={nuevoCodigo}
                      onChange={(e) => setNuevoCodigo(e.target.value)}
                      placeholder="Código"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={nuevaUnidad}
                      onChange={(e) => setNuevaUnidad(e.target.value)}
                      placeholder="Unidad (ej. unidad)"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="Nombre del producto"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={nuevoCosto}
                    onChange={(e) => setNuevoCosto(e.target.value)}
                    placeholder={`Costo unitario (${monedaSimbolo})`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => setCreandoProducto(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" className="flex-1" disabled={guardandoProducto} onClick={crearProductoRapido}>
                      {guardandoProducto ? "Guardando..." : "Agregar al catálogo"}
                    </Button>
                  </div>
                </div>
              )}

              {!puedeCrearProducto && productos.length === 0 && (
                <p className="text-xs text-gray-400">
                  No hay productos en el catálogo todavía — pedile a tu coordinador que agregue el que necesitás en Inventario.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Monto ({monedaSimbolo})</label>
                <input
                  type="number"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="150.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">¿Qué cubre este costo adicional?</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Horas adicionales de mano de obra por..."
                />
              </div>
            </div>
          )}

          <Button type="button" disabled={enviando} onClick={enviar} className="w-full">
            {enviando ? "Enviando..." : "Enviar al cliente"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
