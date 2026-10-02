"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionBuscable {
  value: string;
  label: string;
  // Opcional — agrupa visualmente opciones consecutivas que comparten el mismo grupo
  // (ej. "Sistemas del cliente" vs "General" en el selector de Sistema). El orden del
  // array manda: no se reordena por grupo, solo se inserta un encabezado cuando cambia.
  grupo?: string;
}

interface Props {
  // Dos modos: controlado (value+onChange, para formularios de react-hook-form que ya
  // manejan el campo con setValue/watch — mismo patrón que el selector de Sistema en
  // crear-ticket-form.tsx) o no controlado (defaultValue+name, para filtros dentro de un
  // <form method="GET"> server-rendered, con un input oculto que lo hace funcionar igual
  // que el <select name="..."> nativo que reemplaza).
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  options: OpcionBuscable[];
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

// Reemplazo de <select> para listas que hoy son cortas pero van a crecer (Cliente,
// Activo, Sucursal, Técnico, SistemaSoftware, CategoriaActivo, Repuesto) — un <select>
// nativo se vuelve inmanejable para elegir por nombre entre cientos de opciones.
export function ComboboxBuscable({
  value: valorControlado,
  defaultValue,
  onChange,
  name,
  options,
  placeholder = "Selecciona...",
  disabled,
  emptyMessage = "Sin resultados",
}: Props) {
  const [valorInterno, setValorInterno] = useState(defaultValue ?? "");
  const valor = valorControlado !== undefined ? valorControlado : valorInterno;

  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [indiceActivo, setIndiceActivo] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const seleccionada = options.find((o) => o.value === valor);
  const filtradas = busqueda.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    queueMicrotask(() => {
      inputRef.current?.focus();
      setIndiceActivo(0);
    });
  }, [abierto]);

  function actualizar(nuevoValor: string) {
    if (onChange) onChange(nuevoValor);
    else setValorInterno(nuevoValor);
  }

  function elegir(opcion: OpcionBuscable) {
    actualizar(opcion.value);
    setAbierto(false);
    setBusqueda("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setAbierto(false);
      setBusqueda("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceActivo((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opcion = filtradas[indiceActivo];
      if (opcion) elegir(opcion);
    }
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={valor} />}
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setAbierto(true);
          setBusqueda("");
        }}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={`truncate ${seleccionada ? "text-gray-900" : "text-gray-400"}`}>
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <span className="shrink-0 text-gray-400">▾</span>
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setIndiceActivo(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar..."
            className="w-full rounded-t-lg border-b border-gray-100 px-3 py-2 text-sm outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtradas.map((o, i) => (
              <li key={o.value}>
                {o.grupo && o.grupo !== filtradas[i - 1]?.grupo && (
                  <p className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{o.grupo}</p>
                )}
                <button
                  type="button"
                  onClick={() => elegir(o)}
                  className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                    i === indiceActivo ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  } ${o.value === valor ? "font-medium" : ""}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
