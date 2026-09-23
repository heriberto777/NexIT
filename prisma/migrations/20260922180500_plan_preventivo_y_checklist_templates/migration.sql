/*
  Warnings:

  - You are about to drop the column `mantenimientoProgramadoId` on the `tickets` table. All the data in the column will be lost.
  - You are about to drop the `checklist_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mantenimientos_programados` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "FrecuenciaMantenimiento" AS ENUM ('SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "EstadoPlanPreventivo" AS ENUM ('ACTIVO', 'PAUSADO');

-- DropForeignKey
ALTER TABLE "checklist_items" DROP CONSTRAINT "checklist_items_templateId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_activoId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_checklistTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "mantenimientos_programados" DROP CONSTRAINT "mantenimientos_programados_tecnicoSugeridoId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_checklist_respuestas" DROP CONSTRAINT "ticket_checklist_respuestas_checklistItemId_fkey";

-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_mantenimientoProgramadoId_fkey";

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "mantenimientoProgramadoId",
ADD COLUMN     "planPreventivoId" TEXT;

-- DropTable
DROP TABLE "checklist_items";

-- DropTable
DROP TABLE "mantenimientos_programados";

-- CreateTable
CREATE TABLE "checklist_item_templates" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipoRespuesta" "TipoRespuestaChecklist" NOT NULL,
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orden" INTEGER NOT NULL,
    "observacionObligatoria" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "checklist_item_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_mantenimiento_preventivo" (
    "id" TEXT NOT NULL,
    "activoId" TEXT,
    "sucursalId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "frecuencia" "FrecuenciaMantenimiento" NOT NULL,
    "fechaUltimoMantenimiento" TIMESTAMP(3),
    "proximaFecha" TIMESTAMP(3) NOT NULL,
    "tecnicoAsignadoId" TEXT,
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoPlanPreventivo" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "planes_mantenimiento_preventivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_item_templates_templateId_idx" ON "checklist_item_templates"("templateId");

-- CreateIndex
CREATE INDEX "planes_mantenimiento_preventivo_activoId_idx" ON "planes_mantenimiento_preventivo"("activoId");

-- CreateIndex
CREATE INDEX "planes_mantenimiento_preventivo_sucursalId_idx" ON "planes_mantenimiento_preventivo"("sucursalId");

-- CreateIndex
CREATE INDEX "planes_mantenimiento_preventivo_proximaFecha_idx" ON "planes_mantenimiento_preventivo"("proximaFecha");

-- AddForeignKey
ALTER TABLE "checklist_item_templates" ADD CONSTRAINT "checklist_item_templates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento_preventivo" ADD CONSTRAINT "planes_mantenimiento_preventivo_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "activos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento_preventivo" ADD CONSTRAINT "planes_mantenimiento_preventivo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento_preventivo" ADD CONSTRAINT "planes_mantenimiento_preventivo_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_planPreventivoId_fkey" FOREIGN KEY ("planPreventivoId") REFERENCES "planes_mantenimiento_preventivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_checklist_respuestas" ADD CONSTRAINT "ticket_checklist_respuestas_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_item_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
