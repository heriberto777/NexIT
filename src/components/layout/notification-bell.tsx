"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { obtenerNotificaciones } from "@/server/actions/notificaciones/obtener-notificaciones";
import { marcarNotificacionLeida, marcarTodasNotificacionesLeidas } from "@/server/actions/notificaciones/marcar-leida";

interface NotificacionItem {
  id: string;
  tipo: "TICKET_SIN_ASIGNAR" | "TICKET_ASIGNADO" | "CONTACTO_PENDIENTE_NUEVO" | "TICKET_CAMBIO_ESTADO";
  titulo: string;
  mensaje: string;
  ticketId: string | null;
  contactoPendienteId: string | null;
  leida: boolean;
  fechaCreacion: string;
}

// A dónde navegar al hacer clic — depende del tipo Y de quién está mirando (un
// TICKET_ASIGNADO lo ve el técnico en /tickets/[id], pero un TICKET_CAMBIO_ESTADO lo ve
// el cliente en /portal/tickets/[id]; la notificación en sí no sabe en qué pantalla va
// a ser leída).
function linkPara(n: NotificacionItem, rol: string): string | null {
  if (n.tipo === "CONTACTO_PENDIENTE_NUEVO") return "/admin/contactos-pendientes";
  if (!n.ticketId) return null;
  return rol === "CLIENTE" ? `/portal/tickets/${n.ticketId}` : `/tickets/${n.ticketId}`;
}

export function NotificationBell() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<NotificacionItem[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [rol, setRol] = useState<string>("");
  const [localeFecha, setLocaleFecha] = useState("es-DO");
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const datos = await obtenerNotificaciones();
    setItems(datos.items as NotificacionItem[]);
    setNoLeidas(datos.noLeidas);
    setRol(datos.rol);
    setLocaleFecha(datos.localeFecha);
    return datos.intervaloSegundos;
  }, []);

  // Primer fetch al montar, y recién con el intervaloSegundos que viene de la
  // respuesta se arma el sondeo periódico — así el valor configurado en
  // /admin/configuracion siempre manda, sin hardcodear nada en el cliente.
  useEffect(() => {
    let cancelado = false;
    queueMicrotask(() => {
      cargar().then((intervaloSegundos) => {
        if (cancelado) return;
        intervaloRef.current = setInterval(cargar, intervaloSegundos * 1000);
      });
    });
    return () => {
      cancelado = true;
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto]);

  async function onClickNotificacion(n: NotificacionItem) {
    if (!n.leida) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      setNoLeidas((prev) => Math.max(0, prev - 1));
      await marcarNotificacionLeida({ id: n.id });
    }
    setAbierto(false);
    const destino = linkPara(n, rol);
    if (destino) router.push(destino);
  }

  async function onMarcarTodas() {
    setItems((prev) => prev.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
    await marcarTodasNotificacionesLeidas();
  }

  const formato = new Intl.DateTimeFormat(localeFecha, { dateStyle: "short", timeStyle: "short" });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        aria-label="Notificaciones"
        aria-expanded={abierto}
      >
        <Bell className="h-5 w-5" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">Notificaciones</p>
            {noLeidas > 0 && (
              <button type="button" onClick={onMarcarTodas} className="text-xs text-blue-600 underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No tienes notificaciones.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onClickNotificacion(n)}
                className={`block w-full border-b border-gray-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50 ${
                  n.leida ? "" : "bg-blue-50/60"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.leida && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-blue-600" />}
                  <div className={n.leida ? "flex-1 pl-3.5" : "flex-1"}>
                    <p className={`text-sm ${n.leida ? "text-gray-600" : "font-semibold text-gray-900"}`}>{n.titulo}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{n.mensaje}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{formato.format(new Date(n.fechaCreacion))}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
