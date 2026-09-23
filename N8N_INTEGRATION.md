# Integración NexIT ↔ n8n

Documentación de los eventos que NexIT envía por webhook, cómo verificarlos en n8n, y
una plantilla de workflow lista para importar (o armar a mano, paso a paso).

## 1. Especificación de los payloads

Todo evento se envía como `POST` a `WEBHOOK_N8N_URL` con este sobre común:

```json
{
  "evento": "TICKET_CREADO | TICKET_CAMBIO_ESTADO | SLA_EN_RIESGO",
  "timestamp": "2026-09-22T19:35:41.001Z",
  "data": { /* específico de cada evento, ver abajo */ }
}
```

Headers en cada request (fuente: `src/server/services/webhook.service.ts`):

```
Content-Type: application/json
X-NexIT-Signature: sha256=<hmac-sha256 hex del body completo, con WEBHOOK_SECRET>
Authorization: Bearer <WEBHOOK_SECRET>
```

Los dos headers de autenticación solo se envían si `WEBHOOK_SECRET` está configurado
en NexIT. Si no lo está, el payload llega sin firmar (no recomendado en producción).

### `TICKET_CREADO`

Se dispara al crear un ticket desde `/portal` (`origen: "PORTAL"`) o al generarse
automáticamente desde un plan preventivo (`origen: "PROGRAMADO"`).

```json
{
  "evento": "TICKET_CREADO",
  "timestamp": "2026-09-22T19:35:41.001Z",
  "data": {
    "ticketId": "cmud08cs7001ldng8qep2s38e",
    "numeroTicket": "TCK-0002",
    "clienteId": "cmud08c570001dng86efar0f2",
    "clienteNombre": "Hospital San Rafael",
    "titulo": "Switch de piso 3 no responde",
    "prioridad": "CRITICA",
    "origen": "PORTAL",
    "reportadoPorNombre": "Ana Torres",
    "reportadoPorEmail": "cliente@hospitalsanrafael.com"
  }
}
```

> **Importante sobre `reportadoPorEmail`**: el modelo `Cliente` de NexIT no tiene un
> email propio de empresa — solo `Usuario.email`. Cuando `origen: "PORTAL"`,
> `reportadoPorEmail` es el correo del cliente que reportó la falla (destinatario
> correcto para la confirmación). Cuando `origen: "PROGRAMADO"`, es el correo del
> **coordinador** que corrió la generación automática, no un contacto del cliente — tu
> workflow debe filtrar por `origen` antes de mandar el email de confirmación (ver §3).

### `TICKET_CAMBIO_ESTADO`

Se dispara en tres transiciones puntuales: check-in del técnico (`EN_DIAGNOSTICO`),
cierre del wizard de ejecución (`ESPERANDO_VALIDACION`) y aprobación del cliente
(`RESUELTO`). No se dispara en `REABIERTO` (rechazo del cliente) ni en `CERRADO`
(cierre administrativo) — no forman parte de los tres eventos de integración pedidos.

```json
{
  "evento": "TICKET_CAMBIO_ESTADO",
  "timestamp": "2026-09-22T21:10:03.500Z",
  "data": {
    "ticketId": "cmud08cs7001ldng8qep2s38e",
    "numeroTicket": "TCK-0002",
    "clienteNombre": "Hospital San Rafael",
    "estadoAnterior": "EN_EJECUCION",
    "estadoNuevo": "ESPERANDO_VALIDACION",
    "reportadoPorNombre": "Ana Torres",
    "reportadoPorEmail": "cliente@hospitalsanrafael.com"
  }
}
```

`estadoNuevo` es siempre uno de `"EN_DIAGNOSTICO" | "ESPERANDO_VALIDACION" | "RESUELTO"`.

### `SLA_EN_RIESGO`

Se dispara desde `POST /api/cron/sla-check` (ver §4) — no desde una acción de usuario,
porque "estar a punto de vencer" es una condición de tiempo, no un evento discreto.

```json
{
  "evento": "SLA_EN_RIESGO",
  "timestamp": "2026-09-22T21:15:00.000Z",
  "data": {
    "ticketId": "cmud08cta001ndng8f1ttdp1t",
    "numeroTicket": "TCK-0003",
    "clienteNombre": "Constructora ABC S.A.",
    "titulo": "Instalación de punto de red adicional",
    "prioridad": "MEDIA",
    "tecnicoAsignadoNombre": null,
    "estadoSla": "en_riesgo",
    "minutosRestantes": 42
  }
}
```

`estadoSla` es `"en_riesgo"` (80%+ del tiempo de resolución consumido) o `"vencido"`
(100%+). `tecnicoAsignadoNombre` es `null` si el ticket aún no tiene técnico asignado —
justamente el caso que más urge escalar. Cada corrida del cron reevalúa todos los
tickets abiertos con SLA: uno que sigue en riesgo genera un nuevo evento en cada
corrida (recordatorio), no solo la primera vez.

## 2. Verificar la firma HMAC en n8n

El paso crítico es que n8n reciba el **body crudo** (los mismos bytes que NexIT
firmó), no el JSON ya re-parseado — si n8n lo reserializa antes de calcular el HMAC,
el resultado no va a coincidir aunque el contenido sea "igual" (cambia el orden de
llaves, espacios, etc.).

1. **Nodo Webhook**: método `POST`, en **Options** activa **"Raw Body"** (o
   "Response Data" según tu versión) para que el body llegue como string crudo en vez
   de objeto ya parseado. Configura **Respond**: "Using Respond to Webhook Node" (así
   controlas cuándo responder, en vez de que n8n responda automáticamente antes de
   terminar de procesar).

2. **Verificar la firma** — dos formas, usa la que prefieras:

   **Opción A — nodo Crypto** (sin `require`, más simple):
   - Operation: `Hmac`
   - Type: `SHA256`
   - Value: `{{$json.body}}` (el string crudo del paso 1 — el nombre exacto del
     campo puede variar según tu versión de n8n; revísalo ejecutando el workflow una
     vez con datos de prueba y mirando la pestaña "JSON" del nodo Webhook)
   - Secret: tu `WEBHOOK_SECRET`, idealmente como variable de entorno de n8n
     (`{{$env.WEBHOOK_SECRET}}`) en vez de pegarlo literal en el nodo
   - Output Property Name: `firmaCalculada`

   Después, un nodo **IF** comparando:
   `={{ 'sha256=' + $json.firmaCalculada }}` **igual a**
   `={{ $('Webhook').item.json.headers['x-nexit-signature'] }}`

   **Opción B — nodo Code** (todo en un paso, requiere que tu instancia de n8n
   permita `require('crypto')` en Code nodes — es un módulo built-in de Node, casi
   siempre permitido por defecto):

   ```js
   const crypto = require('crypto');
   const secret = $env.WEBHOOK_SECRET;
   const rawBody = $input.first().json.body; // ajusta el nombre según tu versión
   const firmaRecibida = $input.first().json.headers['x-nexit-signature'] || '';
   const firmaCalculada = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

   if (firmaRecibida !== firmaCalculada) {
     throw new Error('Firma inválida — posible request falsificado');
   }

   return [{ json: JSON.parse(rawBody) }];
   ```

   Con la Opción B, un `throw` dentro de un Code node detiene el workflow y lo marca
   como fallido — suficiente para rechazar el request sin construir un branch de error
   aparte, aunque no le da un 401 explícito al llamador (NexIT no le importa el código
   de estado; ya despachó el webhook en segundo plano y no reintenta).

3. Si usaste la Opción A, agrega después del IN un nodo **Code** para convertir el
   string crudo en objeto: `return [{ json: JSON.parse($json.body) }];` — a partir de
   aquí, todos los ejemplos de expresiones (`{{$json.evento}}`, `{{$json.data...}}`)
   asumen que ya pasaste por este parseo.

## 3. Workflow: enrutar por tipo de evento

Con el body ya verificado y parseado, arma el resto así:

```
Webhook → Crypto/Code (firma) → IF (firma válida) ─┬─ false → (fin, sin responder = 401 implícito, o Respond to Webhook 401)
                                                     └─ true → Respond to Webhook (200 "recibido")
                                                              → Switch (por $json.evento)
                                                                 ├─ TICKET_CREADO
                                                                 ├─ TICKET_CAMBIO_ESTADO
                                                                 └─ SLA_EN_RIESGO
```

Responder ANTES del Switch es intencional: NexIT ya despachó el webhook de forma
fire-and-forget con un timeout de 8s — si el envío del email/Telegram tarda, no hay
razón para que NexIT espere. n8n sigue ejecutando los nodos posteriores al "Respond to
Webhook" en segundo plano igual.

### a) `TICKET_CREADO` → confirmación al cliente

```
Switch[TICKET_CREADO] → IF ($json.data.origen == "PORTAL")
                          ├─ true  → Send Email (SMTP)
                          │            To: {{$json.data.reportadoPorEmail}}
                          │            Subject: Ticket #{{$json.data.numeroTicket}} recibido
                          │            Body: "Hola {{$json.data.reportadoPorNombre}}, registramos tu
                          │                   solicitud '{{$json.data.titulo}}' con prioridad
                          │                   {{$json.data.prioridad}}. Te avisaremos cuando un
                          │                   técnico la atienda."
                          │          → (opcional) Telegram: sendMessage — requiere mapear
                          │             reportadoPorEmail → chat_id en una tabla propia de n8n
                          │             (el payload de NexIT no incluye chat_id de Telegram)
                          └─ false → NoOp (origen PROGRAMADO: el "reportador" es un
                                      coordinador, no un contacto del cliente — no se le
                                      manda una "confirmación de tu reporte")
```

### b) `TICKET_CAMBIO_ESTADO` → aviso de visita lista para aprobar

```
Switch[TICKET_CAMBIO_ESTADO] → IF ($json.data.estadoNuevo == "ESPERANDO_VALIDACION")
                                 ├─ true  → Send Email (SMTP)
                                 │            To: {{$json.data.reportadoPorEmail}}
                                 │            Subject: Visita completada — Ticket #{{$json.data.numeroTicket}}
                                 │            Body: "El técnico finalizó la visita para
                                 │                   '{{$json.data.clienteNombre}}'. Ingresa a
                                 │                   {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}}
                                 │                   para revisar el informe y aprobar o rechazar."
                                 └─ false → NoOp (EN_DIAGNOSTICO / RESUELTO: sin acción hoy,
                                             el Switch deja el branch listo para extender)
```

`NEXIT_BASE_URL` es una variable de entorno propia de tu instancia de n8n (ej.
`https://nexit.tuempresa.com`) — el payload trae `ticketId` pero no la URL base, ya
que esa es una decisión de despliegue, no algo que la app deba conocer sobre n8n.

### c) `SLA_EN_RIESGO` → alerta al equipo técnico/coordinador

```
Switch[SLA_EN_RIESGO] → Telegram (sendMessage a un GRUPO, no a un usuario) o Slack
                           Texto: "🚨 SLA {{$json.data.estadoSla === 'vencido' ? 'VENCIDO' : 'en riesgo'}}
                                   — Ticket #{{$json.data.numeroTicket}} ({{$json.data.clienteNombre}})
                                   Prioridad: {{$json.data.prioridad}}
                                   Técnico: {{$json.data.tecnicoAsignadoNombre || 'SIN ASIGNAR'}}
                                   Restan: {{$json.data.minutosRestantes}} min"
```

Sin IF adicional aquí: `/api/cron/sla-check` solo dispara este evento para tickets que
YA están en `en_riesgo` o `vencido` — el filtro ya ocurrió del lado de NexIT.

## 4. Cron del chequeo de SLA (`Schedule Trigger`)

```
Schedule Trigger (cada 15 min) → HTTP Request
                                    Method: POST
                                    URL: https://nexit.tuempresa.com/api/cron/sla-check
                                    Authentication: Header Auth (credencial de n8n)
                                      Name:  Authorization
                                      Value: Bearer <WEBHOOK_SECRET>
```

Configuración del **Schedule Trigger**: modo "Interval", Unit = "Minutes", Value = 15.

Para el header `Authorization`, usa una credencial de tipo **Header Auth** en vez de
escribir el secreto directo en el nodo — así no queda expuesto si exportas/compartes
el workflow. Alternativa rápida sin credencial: escribir el header manualmente en
"Header Parameters" del HTTP Request node (menos seguro, pero funcional para probar).

La respuesta de NexIT es `{ "revisados": N, "notificados": M }` — puedes encadenar un
nodo IF que solo loguee/alerte si `notificados > 0`, aunque no es necesario: cada
`SLA_EN_RIESGO` ya llega como su propio webhook independiente al workflow de §3.

## 5. JSON importable (punto de partida)

Dos workflows para importar en n8n ("Import from File" o pegar en "Import from
Clipboard"). **Después de importar**, tendrás que: crear/asignar las credenciales SMTP
y Telegram (no viajan en el export), revisar el nombre exacto del campo de body crudo
del Webhook node en tu versión de n8n, y configurar `WEBHOOK_SECRET` /
`NEXIT_BASE_URL` como variables de entorno de tu instancia de n8n.

### Workflow 1 — Router de eventos

```json
{
  "name": "NexIT - Eventos webhook",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "nexit-events",
        "responseMode": "responseNode",
        "options": { "rawBody": true }
      },
      "id": "webhook-nexit",
      "name": "Webhook NexIT",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "jsCode": "const crypto = require('crypto');\nconst secret = $env.WEBHOOK_SECRET;\nconst rawBody = $input.first().json.body;\nconst firmaRecibida = $input.first().json.headers['x-nexit-signature'] || '';\nconst firmaCalculada = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');\nif (firmaRecibida !== firmaCalculada) {\n  throw new Error('Firma invalida');\n}\nreturn [{ json: JSON.parse(rawBody) }];"
      },
      "id": "verificar-firma",
      "name": "Verificar firma HMAC",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 0]
    },
    {
      "parameters": { "respondWith": "json", "responseBody": "={{ { \"recibido\": true } }}" },
      "id": "responder-ok",
      "name": "Respond 200",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [440, 0]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "TICKET_CREADO", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "TICKET_CAMBIO_ESTADO", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "SLA_EN_RIESGO", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-evento",
      "name": "Switch por evento",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [660, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.data.origen}}", "rightValue": "PORTAL", "operator": { "type": "string", "operation": "equals" } }] }
      },
      "id": "if-origen-portal",
      "name": "IF origen PORTAL",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [880, -200]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Ticket #{{$json.data.numeroTicket}} recibido",
        "text": "=Hola {{$json.data.reportadoPorNombre}}, registramos tu solicitud \"{{$json.data.titulo}}\" con prioridad {{$json.data.prioridad}}. Te avisaremos cuando un tecnico la atienda."
      },
      "id": "email-ticket-creado",
      "name": "Email confirmacion ticket",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [1100, -260]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.data.estadoNuevo}}", "rightValue": "ESPERANDO_VALIDACION", "operator": { "type": "string", "operation": "equals" } }] }
      },
      "id": "if-esperando-validacion",
      "name": "IF ESPERANDO_VALIDACION",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [880, 0]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Visita completada - Ticket #{{$json.data.numeroTicket}}",
        "text": "=El tecnico finalizo la visita. Ingresa a {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}} para revisar el informe y aprobar o rechazar."
      },
      "id": "email-esperando-validacion",
      "name": "Email revisar y aprobar",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [1100, 40]
    },
    {
      "parameters": {
        "chatId": "={{$env.NEXIT_TELEGRAM_CHAT_ID}}",
        "text": "=🚨 SLA {{$json.data.estadoSla === 'vencido' ? 'VENCIDO' : 'en riesgo'}} - Ticket #{{$json.data.numeroTicket}} ({{$json.data.clienteNombre}})\nPrioridad: {{$json.data.prioridad}}\nTecnico: {{$json.data.tecnicoAsignadoNombre || 'SIN ASIGNAR'}}\nRestan: {{$json.data.minutosRestantes}} min"
      },
      "id": "telegram-alerta-sla",
      "name": "Telegram alerta SLA",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [880, 240]
    }
  ],
  "connections": {
    "Webhook NexIT": { "main": [[{ "node": "Verificar firma HMAC", "type": "main", "index": 0 }]] },
    "Verificar firma HMAC": { "main": [[{ "node": "Respond 200", "type": "main", "index": 0 }]] },
    "Respond 200": { "main": [[{ "node": "Switch por evento", "type": "main", "index": 0 }]] },
    "Switch por evento": {
      "main": [
        [{ "node": "IF origen PORTAL", "type": "main", "index": 0 }],
        [{ "node": "IF ESPERANDO_VALIDACION", "type": "main", "index": 0 }],
        [{ "node": "Telegram alerta SLA", "type": "main", "index": 0 }]
      ]
    },
    "IF origen PORTAL": { "main": [[{ "node": "Email confirmacion ticket", "type": "main", "index": 0 }], []] },
    "IF ESPERANDO_VALIDACION": { "main": [[{ "node": "Email revisar y aprobar", "type": "main", "index": 0 }], []] }
  }
}
```

### Workflow 2 — Cron de SLA

```json
{
  "name": "NexIT - Cron SLA",
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] } },
      "id": "schedule-sla",
      "name": "Cada 15 min",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/cron/sla-check",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth"
      },
      "id": "http-sla-check",
      "name": "POST sla-check",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [220, 0],
      "credentials": { "httpHeaderAuth": { "id": "REEMPLAZAR", "name": "NexIT Webhook Secret" } }
    }
  ],
  "connections": {
    "Cada 15 min": { "main": [[{ "node": "POST sla-check", "type": "main", "index": 0 }]] }
  }
}
```

Crea la credencial **Header Auth** referenciada (`REEMPLAZAR`) con `Name: Authorization`,
`Value: Bearer <tu WEBHOOK_SECRET>` desde el panel de Credentials de n8n antes de
activar el workflow.
