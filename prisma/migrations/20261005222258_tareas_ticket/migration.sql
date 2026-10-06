-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoActividadTarea" AS ENUM ('CREACION', 'CAMBIO_ESTADO', 'REASIGNACION', 'COMENTARIO');

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'TAREA_ASIGNADA';
ALTER TYPE "TipoNotificacion" ADD VALUE 'TAREA_COMENTARIO';
ALTER TYPE "TipoNotificacion" ADD VALUE 'TAREA_MENCION';

-- CreateTable
CREATE TABLE "ticket_tareas" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "estado" "EstadoTarea" NOT NULL DEFAULT 'PENDIENTE',
    "asignadoAId" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCompletada" TIMESTAMP(3),

    CONSTRAINT "ticket_tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tarea_actividad" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoActividadTarea" NOT NULL,
    "comentario" TEXT,
    "fotoArchivo" TEXT,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_tarea_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tarea_menciones" (
    "actividadId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "ticket_tarea_menciones_pkey" PRIMARY KEY ("actividadId","usuarioId")
);

-- CreateIndex
CREATE INDEX "ticket_tareas_ticketId_idx" ON "ticket_tareas"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_tareas_asignadoAId_idx" ON "ticket_tareas"("asignadoAId");

-- CreateIndex
CREATE INDEX "ticket_tarea_actividad_tareaId_idx" ON "ticket_tarea_actividad"("tareaId");

-- AddForeignKey
ALTER TABLE "ticket_tareas" ADD CONSTRAINT "ticket_tareas_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tareas" ADD CONSTRAINT "ticket_tareas_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tareas" ADD CONSTRAINT "ticket_tareas_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tarea_actividad" ADD CONSTRAINT "ticket_tarea_actividad_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "ticket_tareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tarea_actividad" ADD CONSTRAINT "ticket_tarea_actividad_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tarea_menciones" ADD CONSTRAINT "ticket_tarea_menciones_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "ticket_tarea_actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tarea_menciones" ADD CONSTRAINT "ticket_tarea_menciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
