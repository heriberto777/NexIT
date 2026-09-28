import { z } from "zod";

// Un <select> HTML con una opción "sin seleccionar" manda value="" — un campo cuid
// opcional debe tratar ese "" igual que "no enviado" (undefined), no como un id
// inválido. Sin esto, z.string().cuid().optional() rechaza la cadena vacía y el
// formulario falla la validación en silencio (el error nunca se muestra si el campo
// no tiene su propio <p>{errors.x}</p>).
// También normaliza `null` (no solo ""): los formularios HTML nunca mandan null, pero
// un JSON armado por un modelo de IA (ver /api/n8n/conversacion/turno) sí — el prompt
// le pide explícitamente "sucursalId: '...' o null" cuando no lo sabe, y sin esto Zod
// rechaza ese null literal con "Expected string, received null".
export const optionalCuid = () => z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().cuid().optional());
