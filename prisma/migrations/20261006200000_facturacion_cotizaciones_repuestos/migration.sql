-- AlterEnum
ALTER TYPE "OrigenTicket" ADD VALUE 'SEGUIMIENTO';

-- CreateEnum
CREATE TYPE "EstadoFacturacion" AS ENUM ('PENDIENTE', 'FACTURADO');

-- AlterTable
ALTER TABLE "repuestos" ADD COLUMN "precioVenta" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "ticket_repuestos" ADD COLUMN "estadoFacturacion" "EstadoFacturacion" NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN "estadoFacturacion" "EstadoFacturacion" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN "ticketInstalacionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_ticketInstalacionId_key" ON "cotizaciones"("ticketInstalacionId");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_ticketInstalacionId_fkey" FOREIGN KEY ("ticketInstalacionId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
