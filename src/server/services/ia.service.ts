import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export type MensajeIA = { rol: "USUARIO" | "ASISTENTE"; contenido: string };

const TIMEOUT_MS = 30000; // generación de texto tarda más que un webhook — 8s se queda corto.

async function fetchConTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // Node/undici tira un TypeError genérico ("fetch failed") tanto para DNS como para
    // conexión rechazada — sin esto el admin ve "fetch failed" a secas al probar un LLM
    // local que no está corriendo, sin ninguna pista de qué URL falló ni por qué.
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`El modelo de IA no respondió a tiempo (más de ${TIMEOUT_MS / 1000}s).`);
    }
    throw new Error(`No se pudo conectar a ${url} — verificá que el servidor esté corriendo y la URL sea correcta.`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Anthropic y OpenAI (y la mayoría de los runtimes locales que los imitan) devuelven el
// detalle del error como JSON ({"error":{"message":"..."}}) — mostrar el texto crudo
// completo satura el mensaje con comillas y llaves; esto se queda solo con lo legible.
function extraerMensajeError(detalle: string): string {
  try {
    const data = JSON.parse(detalle) as { error?: { message?: string }; message?: string };
    return data.error?.message ?? data.message ?? detalle.slice(0, 200);
  } catch {
    return detalle.slice(0, 200);
  }
}

// "OPENAI" y "LOCAL" comparten el mismo formato de API (la mayoría de los runtimes
// locales — Ollama, LM Studio, vLLM — exponen un endpoint compatible con
// /v1/chat/completions de OpenAI) — solo cambian la URL base y si hace falta Authorization.
async function llamarCompatibleOpenAI(baseUrl: string, apiKey: string | null, modelo: string, systemPrompt: string, historial: MensajeIA[]): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetchConTimeout(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: systemPrompt },
        ...historial.map((m) => ({ role: m.rol === "USUARIO" ? "user" : "assistant", content: m.contenido })),
      ],
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`El modelo de IA respondió ${res.status}: ${detalle ? extraerMensajeError(detalle) : res.statusText}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = data.choices?.[0]?.message?.content;
  if (!texto) throw new Error("El modelo de IA no devolvió ninguna respuesta.");
  return texto;
}

async function llamarAnthropic(apiKey: string, modelo: string, systemPrompt: string, historial: MensajeIA[]): Promise<string> {
  const res = await fetchConTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1024,
      system: systemPrompt,
      messages: historial.map((m) => ({ role: m.rol === "USUARIO" ? "user" : "assistant", content: m.contenido })),
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`El modelo de IA respondió ${res.status}: ${detalle ? extraerMensajeError(detalle) : res.statusText}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const texto = data.content?.find((c) => c.type === "text")?.text;
  if (!texto) throw new Error("El modelo de IA no devolvió ninguna respuesta.");
  return texto;
}

// Único punto de entrada: arma la llamada al proveedor configurado en
// /admin/configuracion (Anthropic, OpenAI, o un LLM local compatible con OpenAI) —
// nadie más en el código debe armar la llamada HTTP directamente.
export async function generarRespuestaIA(systemPrompt: string, historial: MensajeIA[]): Promise<string> {
  const config = await obtenerConfiguracion();
  if (!config.iaHabilitada || !config.iaProveedor || !config.iaModelo) {
    throw new Error("El Asistente IA no está configurado — un Admin debe activarlo en Configuración.");
  }

  if (config.iaProveedor === "ANTHROPIC") {
    if (!config.iaApiKey) throw new Error("Falta la API key de Anthropic en Configuración.");
    return llamarAnthropic(config.iaApiKey, config.iaModelo, systemPrompt, historial);
  }
  if (config.iaProveedor === "OPENAI") {
    if (!config.iaApiKey) throw new Error("Falta la API key de OpenAI en Configuración.");
    return llamarCompatibleOpenAI(config.iaBaseUrl || "https://api.openai.com/v1", config.iaApiKey, config.iaModelo, systemPrompt, historial);
  }
  if (config.iaProveedor === "LOCAL") {
    if (!config.iaBaseUrl) throw new Error("Falta la URL del modelo local en Configuración.");
    return llamarCompatibleOpenAI(config.iaBaseUrl, config.iaApiKey, config.iaModelo, systemPrompt, historial);
  }

  throw new Error(`Proveedor de IA desconocido: "${config.iaProveedor}".`);
}

export interface ResultadoPruebaIA {
  ok: boolean;
  mensaje: string;
}

// Igual que probarWebhook()/probarEnvioSmtp(): la usa el botón "Probar conexión" de
// /admin/configuracion, manda un mensaje mínimo y reporta éxito/error al admin.
export async function probarConexionIA(): Promise<ResultadoPruebaIA> {
  try {
    const respuesta = await generarRespuestaIA(
      "Sos un chequeo de conexión. Respondé únicamente la palabra OK.",
      [{ rol: "USUARIO", contenido: "¿Estás ahí?" }],
    );
    return { ok: true, mensaje: `Conectado — el modelo respondió: "${respuesta.slice(0, 120)}"` };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, mensaje: `No se pudo conectar: ${detalle}` };
  }
}
