"use client";

import { useState } from "react";
import { AuditoriaTabla, type RegistroAuditoriaValue } from "@/components/admin/logs/auditoria-tabla";
import { ErroresTabla, type RegistroErrorValue } from "@/components/admin/logs/errores-tabla";

const TABS = [
  { id: "auditoria", label: "Auditoría" },
  { id: "errores", label: "Errores" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  auditoria: RegistroAuditoriaValue[];
  errores: RegistroErrorValue[];
  localeFecha: string;
}

export function LogsTabs({ auditoria, errores, localeFecha }: Props) {
  const [tab, setTab] = useState<TabId>("auditoria");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label} {t.id === "auditoria" ? `(${auditoria.length})` : `(${errores.length})`}
          </button>
        ))}
      </div>

      {tab === "auditoria" && <AuditoriaTabla registros={auditoria} localeFecha={localeFecha} />}
      {tab === "errores" && <ErroresTabla registros={errores} localeFecha={localeFecha} />}
    </div>
  );
}
