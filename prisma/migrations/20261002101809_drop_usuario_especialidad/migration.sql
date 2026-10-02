-- AlterTable
-- El dato ya se migró a especialidades/usuarios_especialidades en la migración anterior.
ALTER TABLE "usuarios" DROP COLUMN "especialidad";
