-- CreateTable
CREATE TABLE "ticket_colaboradores" (
    "ticketId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_colaboradores_pkey" PRIMARY KEY ("ticketId","usuarioId")
);

-- AddForeignKey
ALTER TABLE "ticket_colaboradores"
  ADD CONSTRAINT "ticket_colaboradores_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_colaboradores"
  ADD CONSTRAINT "ticket_colaboradores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
