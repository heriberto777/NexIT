"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/checklist/signature-pad";
import type { CapturarFirmaInput } from "@/lib/zod/firma.schema";

interface Props {
  ticketId: string;
  isPending: boolean;
  firmaCapturada: boolean;
  onFirmar: (values: CapturarFirmaInput) => void;
}

export function SignatureStep({ ticketId, isPending, firmaCapturada, onFirmar }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [nombreFirmante, setNombreFirmante] = useState("");
  const [cargoFirmante, setCargoFirmante] = useState("");
  const [confirma, setConfirma] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sinFirmante, setSinFirmante] = useState(false);

  function handleSubmit() {
    setFormError(null);
    if (sinFirmante) {
      setFormError("Envío de link remoto aún no implementado — pide al cliente firmar en este dispositivo por ahora.");
      return;
    }
    if (!nombreFirmante.trim()) {
      setFormError("Indica el nombre de quien recibe");
      return;
    }
    if (padRef.current?.isEmpty()) {
      setFormError("Falta la firma en el recuadro");
      return;
    }
    if (!confirma) {
      setFormError("Debes confirmar la conformidad del trabajo");
      return;
    }
    onFirmar({
      ticketId,
      nombreFirmante,
      cargoFirmante: cargoFirmante || undefined,
      firmaBase64: padRef.current!.toDataUrl(),
      confirmaConformidad: true,
    });
  }

  if (firmaCapturada) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">5. Firma Digital de Conformidad</h2>
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Firma capturada correctamente.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">5. Firma Digital de Conformidad</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de quien recibe</label>
        <input
          value={nombreFirmante}
          onChange={(e) => setNombreFirmante(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Cargo (opcional)</label>
        <input
          value={cargoFirmante}
          onChange={(e) => setCargoFirmante(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SignaturePad ref={padRef} />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={confirma}
          onChange={(e) => setConfirma(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Confirmo que el trabajo fue realizado a satisfacción
      </label>

      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <Button type="button" onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "Guardando firma..." : "Capturar firma"}
      </Button>

      <button
        type="button"
        onClick={() => setSinFirmante((v) => !v)}
        className="w-full text-center text-xs text-gray-500 underline"
      >
        No hay quien firme en sitio
      </button>
    </section>
  );
}
