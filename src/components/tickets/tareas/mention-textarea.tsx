"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

export interface CandidatoMencion {
  id: string;
  nombre: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  candidatos: CandidatoMencion[];
  mencionados: CandidatoMencion[];
  onMencionadosChange: (mencionados: CandidatoMencion[]) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
}

// Emojis curados para un service desk (confirmación/rechazo, prioridad, equipos, hora)
// en vez de un picker completo — cubre el 90% de los casos sin cargar una librería.
const EMOJIS = [
  "👍", "👎", "✅", "❌", "⚠️", "🔧", "💡", "📌",
  "🕐", "📎", "🙂", "😕", "🙏", "🎉", "🚀", "💰",
  "📅", "🔥", "👀", "❓", "❗", "💬", "🖥️", "📧",
];

// Autocompletado de "@menciones" estilo Slack/GitHub sobre un <textarea> plano (sin
// contenteditable): el texto visible lleva "@Nombre", pero lo que de verdad viaja al
// servidor es el usuarioId real detrás de cada mención elegida de la lista — nunca se
// infiere a quién se mencionó parseando el texto (ver análisis "Tareas dentro de un
// ticket"), para no confundir a dos personas con nombre parecido. `mencionados` se
// recalcula en cada tecla contra el texto actual, así que borrar a mano un "@Nombre"
// también quita esa mención sin lógica extra. Negrita/cursiva se guardan como markdown
// literal (**texto**/*texto*) — texto plano en la base de datos, sin HTML — y se
// interpretan recién al mostrar el comentario (ver renderComentarioFormateado).
export function MentionTextarea({
  value,
  onChange,
  candidatos,
  mencionados,
  onMencionadosChange,
  placeholder,
  rows = 3,
  disabled,
  id,
}: Props) {
  const [consulta, setConsulta] = useState<{ inicio: number; texto: string } | null>(null);
  const [emojiAbierto, setEmojiAbierto] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disponibles = consulta
    ? candidatos.filter((c) => c.nombre.toLowerCase().includes(consulta.texto.toLowerCase())).slice(0, 6)
    : [];

  function sincronizarMenciones(texto: string) {
    const vigentes = mencionados.filter((m) => texto.includes(`@${m.nombre}`));
    if (vigentes.length !== mencionados.length) onMencionadosChange(vigentes);
  }

  function manejarCambio(e: ChangeEvent<HTMLTextAreaElement>) {
    const texto = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(texto);
    sincronizarMenciones(texto);

    const antesDelCursor = texto.slice(0, cursor);
    const inicioArroba = antesDelCursor.lastIndexOf("@");
    if (inicioArroba === -1) {
      setConsulta(null);
      return;
    }
    const entreArrobaYCursor = antesDelCursor.slice(inicioArroba + 1);
    // Un espacio/salto de línea entre "@" y el cursor cierra esa mención — es texto
    // viejo, no una mención en construcción.
    if (/\s/.test(entreArrobaYCursor)) {
      setConsulta(null);
      return;
    }
    setConsulta({ inicio: inicioArroba, texto: entreArrobaYCursor });
  }

  function elegirMencion(candidato: CandidatoMencion) {
    const textarea = textareaRef.current;
    if (!consulta || !textarea) return;
    const cursor = textarea.selectionStart;
    const nuevoTexto = `${value.slice(0, consulta.inicio)}@${candidato.nombre} ${value.slice(cursor)}`;
    const nuevaPosicion = consulta.inicio + candidato.nombre.length + 2;

    // Se actualiza el DOM directo antes de avisarle a React: así setSelectionRange ya
    // opera sobre el texto final, sin esperar al siguiente render para no mover el
    // cursor sobre el valor viejo.
    textarea.value = nuevoTexto;
    textarea.focus();
    textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);

    onChange(nuevoTexto);
    if (!mencionados.some((m) => m.id === candidato.id)) {
      onMencionadosChange([...mencionados, candidato]);
    }
    setConsulta(null);
  }

  // Envuelve la selección actual con el marcador (**negrita** / *cursiva*); sin
  // selección, inserta el marcador con un texto de ejemplo ya seleccionado para que
  // escribir encima lo reemplace, mismo patrón que el botón "B"/"I" de GitHub/Slack.
  function aplicarFormato(marcador: string, ejemplo: string) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const contenido = fin > inicio ? value.slice(inicio, fin) : ejemplo;
    const nuevoTexto = `${value.slice(0, inicio)}${marcador}${contenido}${marcador}${value.slice(fin)}`;
    const selInicio = inicio + marcador.length;
    const selFin = selInicio + contenido.length;

    textarea.value = nuevoTexto;
    textarea.focus();
    textarea.setSelectionRange(selInicio, selFin);
    onChange(nuevoTexto);
  }

  function insertarEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const nuevoTexto = `${value.slice(0, inicio)}${emoji}${value.slice(fin)}`;
    const nuevaPosicion = inicio + emoji.length;

    textarea.value = nuevoTexto;
    textarea.focus();
    textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);
    onChange(nuevoTexto);
    setEmojiAbierto(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setConsulta(null);
      setEmojiAbierto(false);
      return;
    }
    // Atajos tipo editor — (Cmd en Mac, Ctrl en Windows/Linux).
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      aplicarFormato("**", "negrita");
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      aplicarFormato("*", "cursiva");
    }
  }

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => aplicarFormato("**", "negrita")}
          title="Negrita (Ctrl/Cmd+B)"
          className="rounded px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        >
          B
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => aplicarFormato("*", "cursiva")}
          title="Cursiva (Ctrl/Cmd+I)"
          className="rounded px-2 py-1 text-xs italic text-gray-600 hover:bg-gray-100 disabled:opacity-40"
        >
          I
        </button>
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEmojiAbierto((v) => !v)}
            title="Insertar emoji"
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            🙂
          </button>
          {emojiAbierto && (
            <div className="absolute z-20 mt-1 grid w-56 grid-cols-8 gap-0.5 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertarEmoji(emoji)}
                  className="rounded p-1 text-base hover:bg-gray-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={manejarCambio}
          onKeyDown={onKeyDown}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        />
        {/* Se abre HACIA ARRIBA (bottom-full), no debajo del textarea: el composer suele
            quedar en la mitad inferior del modal, así que anclarlo abajo lo empujaba
            fuera del área visible y obligaba a hacer scroll para ver a quién se estaba
            por mencionar. Ancla relativa a ESTE div (el del textarea), nunca al
            contenedor que lo rodea, para no depender de si el padre se estira o no. */}
        {consulta && disponibles.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-56 max-w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {disponibles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegirMencion(c)}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                @{c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Resalta las menciones ya publicadas de un comentario (comparando contra los nombres
// reales de TicketTareaMencion, nunca adivinando por regex sobre texto libre) e
// interpreta el markdown literal de negrita/cursiva guardado en la base de datos.
export function renderComentarioFormateado(texto: string, nombresMencionados: string[]) {
  const escapados = nombresMencionados.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const patrones = [
    escapados.length > 0 ? `@(?:${escapados.join("|")})` : null,
    "\\*\\*[^*\\n]+\\*\\*",
    "\\*[^*\\n]+\\*",
    "\\n",
  ].filter(Boolean);
  const partes = texto.split(new RegExp(`(${patrones.join("|")})`, "g"));

  return partes.map((parte, i) => {
    if (!parte) return null;
    if (parte === "\n") return <br key={i} />;
    if (nombresMencionados.some((n) => parte === `@${n}`)) {
      return (
        <span key={i} className="rounded bg-blue-50 px-1 font-medium text-blue-700">
          {parte}
        </span>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(parte)) {
      return <strong key={i}>{parte.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(parte)) {
      return <em key={i}>{parte.slice(1, -1)}</em>;
    }
    return <span key={i}>{parte}</span>;
  });
}
