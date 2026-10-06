"use client";

import { useRef, useState } from "react";
import type { MensajeIaPlano } from "@/types/ejecucion";
import { enviarMensajeIA } from "@/server/actions/tickets/ejecucion/enviar-mensaje-ia";
import { marcarRespuestaIaValida } from "@/server/actions/tickets/ejecucion/marcar-respuesta-ia-valida";

interface Props {
  ticketId: string;
  sugerenciaIA: string | null;
  mensajesIniciales: MensajeIaPlano[];
  habilitada: boolean;
}

// Modelo C (acordeón integrado): extiende el panel violeta que ya mostraba
// `sugerenciaIA` en vez de agregar una capa flotante — colapsado muestra la última
// respuesta (o la marcada como solución, si hay una), expandido muestra el hilo
// completo. La conversación vive en ConversacionTicketIA/MensajeTicketIA (un hilo por
// ticket, persistido) — cerrar el acordeón o recargar la página nunca la pierde.
export function IaChatPanel({ ticketId, sugerenciaIA, mensajesIniciales, habilitada }: Props) {
  const [expandido, setExpandido] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeIaPlano[]>(mensajesIniciales);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  if (!habilitada) return null;

  const solucion = mensajes.find((m) => m.esSolucion);
  const ultimaAsistente = [...mensajes].reverse().find((m) => m.rol === "ASISTENTE");
  const resumenColapsado = solucion?.contenido ?? ultimaAsistente?.contenido ?? sugerenciaIA ?? "Preguntale algo a la IA sobre este ticket.";

  function scrollAlFinal() {
    queueMicrotask(() => {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setError(null);
    setEnviando(true);
    setTexto("");

    const resultado = await enviarMensajeIA({ ticketId, mensaje });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      setTexto(mensaje); // no perder lo que escribió si falló
      return;
    }
    setMensajes((prev) => [...prev, resultado.data.mensajeUsuario, resultado.data.mensajeAsistente]);
    scrollAlFinal();
  }

  async function marcarValida(mensajeId: string) {
    setError(null);
    const resultado = await marcarRespuestaIaValida({ mensajeId });
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setMensajes((prev) => prev.map((m) => ({ ...m, esSolucion: m.id === mensajeId })));
  }

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-lg border border-violet-200 bg-violet-50">
      <button
        type="button"
        onClick={() => {
          setExpandido((v) => !v);
          if (!expandido) scrollAlFinal();
        }}
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            🤖 Asistente IA {solucion && <span className="ml-1 text-green-700">· solución marcada</span>}
          </p>
          {!expandido && <p className="truncate text-sm text-violet-900">{resumenColapsado}</p>}
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-violet-600">{expandido ? "Cerrar ▲" : "Abrir ▾"}</span>
      </button>

      {expandido && (
        <div className="flex flex-col gap-2 border-t border-violet-200 bg-white px-3 py-3">
          <div ref={listaRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {mensajes.length === 0 && <p className="text-sm text-gray-400">Todavía no hay conversación — preguntale algo sobre el ticket.</p>}
            {mensajes.map((m) => (
              <div key={m.id} className={`flex ${m.rol === "USUARIO" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.rol === "USUARIO"
                      ? "bg-gray-100 text-gray-800"
                      : m.esSolucion
                        ? "border border-green-300 bg-green-50 text-green-900"
                        : "border border-violet-200 bg-violet-50 text-violet-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                  {m.rol === "ASISTENTE" && (
                    <div className="mt-1.5 flex items-center justify-end">
                      {m.esSolucion ? (
                        <span className="text-xs font-medium text-green-700">✓ Marcada como solución</span>
                      ) : (
                        <button type="button" onClick={() => marcarValida(m.id)} className="text-xs text-violet-600 underline">
                          Marcar como solución
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {enviando && <p className="text-xs text-gray-400">La IA está escribiendo...</p>}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}

          <div className="flex gap-2 pt-1">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={2}
              placeholder="Describí lo que estás viendo o preguntale algo..."
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || !texto.trim()}
              className="shrink-0 self-end rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
