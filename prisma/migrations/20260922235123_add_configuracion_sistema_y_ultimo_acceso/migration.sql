-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ultimoAccesoAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "configuracion_sistema" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "empresaNombre" TEXT NOT NULL DEFAULT 'NexIT',
    "empresaRnc" TEXT,
    "empresaLogoUrl" TEXT,
    "empresaTelefono" TEXT,
    "empresaEmail" TEXT,
    "empresaDireccion" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "webhooksHabilitados" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smtpSsl" BOOLEAN NOT NULL DEFAULT true,
    "slaHorasCritica" INTEGER NOT NULL DEFAULT 4,
    "slaHorasAlta" INTEGER NOT NULL DEFAULT 8,
    "slaHorasMedia" INTEGER NOT NULL DEFAULT 24,
    "slaHorasBaja" INTEGER NOT NULL DEFAULT 48,
    "diasAnticipacionPreventivos" INTEGER NOT NULL DEFAULT 7,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("id")
);
