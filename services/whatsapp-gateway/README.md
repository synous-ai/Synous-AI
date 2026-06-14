# WhatsApp Gateway — NOUS CRM

Servicio **aislado** (fuera del workspace pnpm del monorepo) que corre
[`@open-wa/wa-automate`](https://github.com/open-wa/wa-automate-nodejs) — la
librería conocida de open-wa.org — para conectar un WhatsApp al CRM.

> **Estado actual: solo RECIBE.** No envía nada automáticamente. El envío de
> mensajes lo hace siempre un humano desde su propio WhatsApp. Esto mantiene el
> riesgo de baneo al mínimo.

---

## ⚠️ Antes de usar — leé esto

`@open-wa/wa-automate` es automatización **NO oficial** de WhatsApp (maneja
WhatsApp Web por debajo). Implica:

- **Riesgo de baneo** del número si se manda spam en frío. Por eso acá el envío
  queda en manos del humano y este gateway se usa para **recibir respuestas**.
- **Viola los ToS de WhatsApp.** Usalo con criterio y bajo volumen.
- La sesión (`session-data/`) **es un secreto**: da acceso total a la cuenta.
  Está en `.gitignore`, nunca la subas.
- `@open-wa/wa-automate` es gratis para uso básico, pero algunas versiones piden
  una license key para features avanzadas. El recibir/enviar texto funciona en
  el tier gratuito.

Recomendación: usá un **número dedicado** del negocio, no el personal.

---

## Cómo correrlo

```bash
cd services/whatsapp-gateway
npm install          # baja @open-wa/wa-automate + Chromium (pesado, paciencia)

# 1) Cambiá la API key en cli.config.json (campo "key")
# 2) Arrancá el gateway
npm start
```

La primera vez imprime un **QR en la terminal**: escanealo desde
WhatsApp del teléfono (Dispositivos vinculados). La sesión queda guardada en
`session-data/`, así que no hay que re-escanear en cada arranque.

## Puertos

| Qué        | URL                              |
| ---------- | -------------------------------- |
| REST API   | `http://localhost:8002/`         |
| Swagger    | `http://localhost:8002/api-docs` |

Todas las llamadas requieren el header `api_key: <la key de cli.config.json>`.

---

## Próximo paso (todavía NO implementado)

El objetivo es: **cuando un lead responde, el mensaje entra al CRM y la IA
sugiere la respuesta** continuando la secuencia de setting.

Arquitectura prevista:

```
Lead responde en WhatsApp
        │
        ▼
open-wa dispara webhook  ──POST──►  CRM  /api/prospecting/whatsapp/incoming
        │                                   │
        │                                   ▼
        │                          guarda el mensaje + matchea el prospecto
        │                                   │
        │                                   ▼
        │                          Gemini sugiere la próxima respuesta
        │                          (según en qué paso del setting está)
        ▼                                   │
  el humano revisa la sugerencia  ◄─────────┘  y la envía él mismo
```

Para activarlo, en `cli.config.json` se agregará:

```json
"webhook": "http://localhost:3001/api/prospecting/whatsapp/incoming"
```

…y se construirá ese endpoint en la API + la UI de conversación. **Eso queda
para cuando se dé la orden.**
