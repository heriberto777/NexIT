-- CreateEnum
CREATE TYPE "EstadoContactoPendiente" AS ENUM ('RECOLECTANDO', 'PENDIENTE', 'CONVERTIDO');

-- CreateTable
CREATE TABLE "contactos_pendientes" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "nombre" TEXT,
    "empresaReportada" TEXT,
    "telefonoReportado" TEXT,
    "correoReportado" TEXT,
    "motivo" TEXT,
    "estado" "EstadoContactoPendiente" NOT NULL DEFAULT 'RECOLECTANDO',
    "ticketId" TEXT,
    "contactoCreadoId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactos_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contactos_pendientes_ticketId_key" ON "contactos_pendientes"("ticketId");

-- CreateIndex
CREATE INDEX "contactos_pendientes_canal_identificador_idx" ON "contactos_pendientes"("canal", "identificador");

-- CreateIndex
CREATE INDEX "contactos_pendientes_estado_idx" ON "contactos_pendientes"("estado");

-- AddForeignKey
ALTER TABLE "contactos_pendientes" ADD CONSTRAINT "contactos_pendientes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos_pendientes" ADD CONSTRAINT "contactos_pendientes_contactoCreadoId_fkey" FOREIGN KEY ("contactoCreadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
