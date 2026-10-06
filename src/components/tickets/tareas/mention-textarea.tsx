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
  id?: string;
}

// Autocompletado de "@menciones" estilo Slack/GitHub sobre un <textarea> plano (sin
// contenteditable): el texto visible lleva "@Nombre", pero lo que de verdad viaja al
// servidor es el usuarioId real detrás de cada mención elegida de la lista — nunca se
// infiere a quién se mencionó parseando el texto (ver análisis "Tareas dentro de un
// ticket"), para no confundir a dos personas con nombre parecido. `mencionados` se
// recalcula en cada tecla contra el texto actual, así que borrar a mano un "@Nombre"
// también quita esa mención sin lógica aparte.
export function MentionTextarea({
  value,
  onChange,
  candidatos,
  mencionados,
  onMencionadosChange,
  placeholder,
  rows = 3,
  id,
}: Props) {
  const [consulta, setConsulta] = useState<{ inicio: number; texto: string } | null>(null);
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

  function elegir(candidato: CandidatoMencion) {
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

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={manejarCambio}
        onKeyDown={(e) => {
          if (e.key === "Escape") setConsulta(null);
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {consulta && disponibles.length > 0 && (
        <div className="absolute z-20 mt-1 w-56 max-w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {disponibles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir(c)}
              className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
            >
              @{c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Resalta las menciones ya publicadas de un comentario — compara contra los nombres
// reales de TicketTareaMencion (no vuelve a adivinar por regex sobre texto libre).
export function renderComentarioConMenciones(texto: string, nombresMencionados: string[]) {
  if (nombresMencionados.length === 0) return texto;
  const escapados = nombresMencionados.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const partes = texto.split(new RegExp(`(@(?:${escapados.join("|")}))`, "g"));
  return partes.map((parte, i) =>
    nombresMencionados.some((n) => parte === `@${n}`) ? (
      <span key={i} className="rounded bg-blue-50 px-1 font-medium text-blue-700">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}
