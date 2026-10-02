-- CreateTable
CREATE TABLE "especialidades" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "especialidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_especialidades" (
    "usuarioId" TEXT NOT NULL,
    "especialidadId" TEXT NOT NULL,

    CONSTRAINT "usuarios_especialidades_pkey" PRIMARY KEY ("usuarioId","especialidadId")
);

-- CreateIndex
CREATE UNIQUE INDEX "especialidades_nombre_key" ON "especialidades"("nombre");

-- AddForeignKey
ALTER TABLE "usuarios_especialidades" ADD CONSTRAINT "usuarios_especialidades_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_especialidades" ADD CONSTRAINT "usuarios_especialidades_especialidadId_fkey" FOREIGN KEY ("especialidadId") REFERENCES "especialidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: migra Usuario.especialidad (texto libre, separado por comas) a filas
-- reales de especialidades + el vínculo correspondiente, antes de borrar la columna
-- vieja en la siguiente migración. No usa un lenguaje procedural (plpgsql) a propósito,
-- para que corra igual con los permisos limitados del usuario de BD compartido.
WITH valores AS (
    SELECT id AS "usuarioId", trim(unnest(string_to_array("especialidad", ','))) AS nombre
    FROM "usuarios"
    WHERE "especialidad" IS NOT NULL AND trim("especialidad") <> ''
),
valores_validos AS (
    SELECT "usuarioId", nombre FROM valores WHERE nombre <> ''
),
nombres_unicos AS (
    SELECT DISTINCT nombre FROM valores_validos
),
insertadas AS (
    INSERT INTO "especialidades" ("id", "nombre")
    SELECT gen_random_uuid()::text, nombre FROM nombres_unicos
    RETURNING "id", "nombre"
)
INSERT INTO "usuarios_especialidades" ("usuarioId", "especialidadId")
SELECT DISTINCT v."usuarioId", i."id"
FROM valores_validos v
JOIN insertadas i ON i."nombre" = v.nombre;
