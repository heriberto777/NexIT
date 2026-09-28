-- AlterEnum
ALTER TYPE "OrigenTicket" ADD VALUE 'CHATBOT';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "whatsappTelefono" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_telegramChatId_key" ON "usuarios"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_whatsappTelefono_key" ON "usuarios"("whatsappTelefono");
