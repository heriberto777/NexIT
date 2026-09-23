"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TicketEjecucionData, ChecklistItemPlano, RepuestoPlano, EvidenciaPlana } from "@/types/ejecucion";
import type { DiagnosticoInput, GuardarChecklistInput } from "@/lib/zod/checklist.schema";
import type { RegistrarRepuestoInput } from "@/lib/zod/evidencia.schema";
import type { CapturarFirmaInput } from "@/lib/zod/firma.schema";
import { iniciarAtencion } from "@/server/actions/tickets/ejecucion/iniciar-atencion";
import { guardarDiagnostico } from "@/server/actions/tickets/ejecucion/guardar-diagnostico";
import { guardarChecklist } from "@/server/actions/tickets/ejecucion/guardar-checklist";
import { registrarRepuesto } from "@/server/actions/tickets/ejecucion/registrar-repuesto";
import { capturarFirma } from "@/server/actions/tickets/ejecucion/capturar-firma";
import { finalizarVisita } from "@/server/actions/tickets/ejecucion/finalizar-visita";
import { CheckInStep } from "./steps/check-in-step";
import { ChecklistStep } from "./steps/checklist-step";
import { EvidenceStep } from "./steps/evidence-step";
import { PartsStep } from "./steps/parts-step";
import { SignatureStep } from "./steps/signature-step";
import { CloseStep } from "./steps/close-step";

const TOTAL_STEPS = 6;

interface Props {
  ticket: TicketEjecucionData;
  checklistItems: ChecklistItemPlano[];
  repuestosDisponibles: RepuestoPlano[];
  evidenciasIniciales: EvidenciaPlana[];
}

// El estado del wizard vivía SOLO en memoria del componente, nunca derivado del ticket
// real — si el técnico recargaba la página (o volvía más tarde) después de avanzar,
// siempre reiniciaba en el paso 1. Reintentar "Iniciar Atención" ahí pisaba
// fechaInicioAtencion con un timestamp nuevo y duplicaba la entrada de check-in en el
// historial (visto en pruebas reales de esta conversación). No hay un estado por-paso
// explícito en Ticket — EN_DIAGNOSTICO cubre diagnóstico/checklist/evidencia/repuestos
// por igual — así que esto es una heurística con las señales concretas que sí tenemos.
function calcularPasoInicial(ticket: TicketEjecucionData, evidenciasIniciales: EvidenciaPlana[]): number {
  if (!ticket.fechaInicioAtencion) return 1;
  if (ticket.tieneFirma) return 6;

  const fotosAntes = evidenciasIniciales.filter((e) => e.tipo === "FOTO_ANTES").length;
  const fotosDespues = evidenciasIniciales.filter((e) => e.tipo === "FOTO_DESPUES").length;
  if (fotosAntes >= 2 && fotosDespues >= 2) return 4; // evidencia mínima ya cumplida -> repuestos
  if (fotosAntes > 0 || fotosDespues > 0) return 3; // ya empezó a subir fotos
  return 2; // ya hizo check-in — evita repetirlo y duplicar el historial
}

export function ExecutionWizard({ ticket, checklistItems, repuestosDisponibles, evidenciasIniciales }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(() => calcularPasoInicial(ticket, evidenciasIniciales));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [checkedIn, setCheckedIn] = useState(Boolean(ticket.fechaInicioAtencion));
  const [evidencias, setEvidencias] = useState<EvidenciaPlana[]>(evidenciasIniciales);
  const [repuestosAgregados, setRepuestosAgregados] = useState<{ nombre: string; cantidad: number }[]>([]);
  const [firmaCapturada, setFirmaCapturada] = useState(ticket.tieneFirma);
  const [finalizado, setFinalizado] = useState(false);

  const fotosAntes = evidencias.filter((e) => e.tipo === "FOTO_ANTES").length;
  const fotosDespues = evidencias.filter((e) => e.tipo === "FOTO_DESPUES").length;

  function runAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        onSuccess(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  function handleCheckIn(coords?: { latitud: number; longitud: number }) {
    runAction(
      () => iniciarAtencion({ ticketId: ticket.id, ...coords }),
      () => setCheckedIn(true),
    );
  }

  function handleDiagnostico(values: DiagnosticoInput) {
    runAction(
      () => guardarDiagnostico(values),
      () => setStep(2),
    );
  }

  function handleChecklist(values: GuardarChecklistInput) {
    runAction(
      () => guardarChecklist(values),
      () => setStep(3),
    );
  }

  function handleAgregarRepuesto(values: RegistrarRepuestoInput) {
    const repuesto = repuestosDisponibles.find((r) => r.id === values.repuestoId);
    runAction(
      () => registrarRepuesto(values),
      () => {
        if (repuesto) {
          setRepuestosAgregados((prev) => [...prev, { nombre: repuesto.nombre, cantidad: values.cantidad }]);
        }
      },
    );
  }

  function handleFirmar(values: CapturarFirmaInput) {
    runAction(
      () => capturarFirma(values),
      () => {
        setFirmaCapturada(true);
        setStep(6);
      },
    );
  }

  function handleFinalizar(notasInternas: string | undefined) {
    runAction(
      () => finalizarVisita({ ticketId: ticket.id, notasInternas }),
      () => setFinalizado(true),
    );
  }

  if (finalizado) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-900">Visita finalizada</p>
        <p className="text-sm text-gray-600">
          El ticket #{ticket.numeroTicket} quedó en espera de validación del cliente.
        </p>
        <button type="button" onClick={() => router.back()} className="text-sm text-blue-600 underline">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-gray-50">
      <header className="sticky top-0 z-10 space-y-1 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="text-xs text-gray-500">
              ← Volver
            </button>
          ) : (
            <span />
          )}
          <span className="text-xs font-medium text-gray-500">TICKET #{ticket.numeroTicket}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {ticket.estado.replaceAll("_", " ")}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          {ticket.cliente.nombre} · {ticket.sucursal.nombre}
        </p>
        {ticket.activo && (
          <p className="text-sm font-medium text-gray-900">
            {ticket.activo.marca} {ticket.activo.modelo} — Serie #{ticket.activo.numeroSerie}
          </p>
        )}
        <nav className="flex gap-1 pt-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-blue-600" : "bg-gray-200"}`} />
          ))}
        </nav>
      </header>

      {error && <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <main className="flex-1 space-y-4 px-4 py-4">
        {step === 1 && (
          <CheckInStep
            ticketId={ticket.id}
            checkedIn={checkedIn}
            isPending={isPending}
            onCheckIn={handleCheckIn}
            onSubmitDiagnostico={handleDiagnostico}
          />
        )}

        {step === 2 && (
          <ChecklistStep
            ticketId={ticket.id}
            items={checklistItems}
            isPending={isPending}
            onSubmit={handleChecklist}
          />
        )}

        {step === 3 && (
          <EvidenceStep
            ticketId={ticket.id}
            evidencias={evidencias}
            onEvidenciaSubida={(evidencia) => setEvidencias((prev) => [...prev, evidencia])}
            onContinue={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <PartsStep
            ticketId={ticket.id}
            repuestosDisponibles={repuestosDisponibles}
            repuestosAgregados={repuestosAgregados}
            isPending={isPending}
            onAgregar={handleAgregarRepuesto}
            onContinue={() => setStep(5)}
          />
        )}

        {step === 5 && (
          <SignatureStep
            ticketId={ticket.id}
            isPending={isPending}
            firmaCapturada={firmaCapturada}
            onFirmar={handleFirmar}
          />
        )}

        {step === 6 && (
          <CloseStep
            isPending={isPending}
            fotosAntes={fotosAntes}
            fotosDespues={fotosDespues}
            firmaCapturada={firmaCapturada}
            onFinalizar={handleFinalizar}
            onGuardarParaDespues={() => router.back()}
          />
        )}
      </main>
    </div>
  );
}
