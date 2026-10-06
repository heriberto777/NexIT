-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN "repuestoId" TEXT,
ADD COLUMN "cantidad" INTEGER;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_repuestoId_fkey" FOREIGN KEY ("repuestoId") REFERENCES "repuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
