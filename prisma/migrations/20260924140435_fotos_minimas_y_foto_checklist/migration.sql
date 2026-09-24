-- AlterTable
ALTER TABLE "configuracion_sistema" ADD COLUMN     "fotosMinimasEvidencia" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ticket_checklist_respuestas" ADD COLUMN     "fotoArchivo" TEXT;
