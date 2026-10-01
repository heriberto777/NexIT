-- AlterTable
ALTER TABLE "configuracion_sistema" ADD COLUMN "notificacionesIntervaloSegundos" INTEGER NOT NULL DEFAULT 30;

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('TICKET_SIN_ASIGNAR', 'TICKET_ASIGNADO', 'CONTACTO_PENDIENTE_NUEVO', 'TICKET_CAMBIO_ESTADO');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "ticketId" TEXT,
    "contactoPendienteId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_usuarioId_leida_idx" ON "notificaciones"("usuarioId", "leida");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_contactoPendienteId_fkey" FOREIGN KEY ("contactoPendienteId") REFERENCES "contactos_pendientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
