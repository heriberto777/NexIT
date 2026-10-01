// Compartida entre el server action y el formulario cliente — vive fuera de
// resetear-datos-prueba.ts porque un archivo "use server" solo puede exportar
// funciones async, nunca una constante.
export const FRASE_CONFIRMACION_RESET = "RESETEAR DATOS DE PRUEBA";
