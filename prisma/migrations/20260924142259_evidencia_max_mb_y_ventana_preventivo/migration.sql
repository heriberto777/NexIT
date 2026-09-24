-- AlterTable
ALTER TABLE "configuracion_sistema" ADD COLUMN     "diasVentanaProximoPreventivo" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "evidenciaMaxMB" INTEGER NOT NULL DEFAULT 8;
