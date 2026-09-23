import { z } from "zod";

// Un <select> HTML con una opción "sin seleccionar" manda value="" — un campo cuid
// opcional debe tratar ese "" igual que "no enviado" (undefined), no como un id
// inválido. Sin esto, z.string().cuid().optional() rechaza la cadena vacía y el
// formulario falla la validación en silencio (el error nunca se muestra si el campo
// no tiene su propio <p>{errors.x}</p>).
export const optionalCuid = () => z.preprocess((v) => (v === "" ? undefined : v), z.string().cuid().optional());
