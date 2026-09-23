-- AlterTable
ALTER TABLE "configuracion_sistema" ADD COLUMN     "localeFecha" TEXT NOT NULL DEFAULT 'es-DO',
ADD COLUMN     "monedaCodigo" TEXT NOT NULL DEFAULT 'DOP',
ADD COLUMN     "monedaSimbolo" TEXT NOT NULL DEFAULT 'RD$';
