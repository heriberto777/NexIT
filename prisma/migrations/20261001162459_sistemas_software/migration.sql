-- AlterEnum
ALTER TYPE "CategoriaSoporte" ADD VALUE 'SOFTWARE_TERCEROS';
ALTER TYPE "CategoriaSoporte" ADD VALUE 'SOFTWARE_SISTEMA';

-- CreateEnum
CREATE TYPE "EstadoSistemaSoftware" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateTable
CREATE TABLE "sistemas_software" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "proveedor" TEXT,
    "estado" "EstadoSistemaSoftware" NOT NULL DEFAULT 'ACTIVO',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sistemas_software_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sistemas_software_clienteId_idx" ON "sistemas_software"("clienteId");

-- AddForeignKey
ALTER TABLE "sistemas_software" ADD CONSTRAINT "sistemas_software_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "sistemaSoftwareId" TEXT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sistemaSoftwareId_fkey" FOREIGN KEY ("sistemaSoftwareId") REFERENCES "sistemas_software"("id") ON DELETE SET NULL ON UPDATE CASCADE;
