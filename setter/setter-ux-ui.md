# UX/UI — La consola del setter

> Cómo debería ser la interfaz con la que vos y Andrés operan la máquina.
> No es un dashboard de vanity metrics: es una **consola de operador** pensada para velocidad.
> Parte del mismo set: `CLAUDE.md`, `prompts-setter.md`, `setter-producto-unificado.md`.

---

## 1. El principio rector

El producto vende velocidad (responder leads en segundos). **La UI tiene que respetar eso para ustedes.** Cada acción que hacen seguido —aprobar un draft, tomar una conversación, ver por qué la IA dijo algo— tiene que ser de **un teclazo o un tap**, no tres clicks y un modal.

Regla de diseño: si una acción se repite 50 veces por día, tiene atajo de teclado y no abre modal.

Referencia estética: **tu design system Resend-inspired (light mode)**. Familia Linear / Attio / Superhuman. Denso, limpio, tipografía con jerarquía clara, mucho aire donde importa, atajos visibles. **Nada de glassmorphism/VJ acá** — eso es para lo que ve el cliente, no para la herramienta de trabajo.

---

## 2. El modelo de dos operadores (lo más importante de este spec)

Ustedes no usan la app igual. La misma base, dos "modos" según rol:

| | **Vos (Ventas / Clientes)** | **Andrés (Arquitectura / Observabilidad)** |
|---|---|---|
| Vive en | La **Bandeja** + Pipeline + Agenda | Config del agente + Métricas + Logs |
| Le importa | Aprobar drafts, tomar conversaciones calientes, que no se caiga un lead | Que el sistema corra, costo por reunión, errores, tunear prompts |
| Notificaciones | Handoff, lead caliente, no-show inminente | Fallos de canal, ban/quality rating, picos de costo |
| Dispositivo | Móvil + desktop | Desktop |

Implicancias de UX:
- **Asignación y presencia.** Cada conversación puede estar "tomada" por uno. Avatar + indicador de quién está escribiendo. **Evitar doble-respuesta** (que vos y Andrés contesten lo mismo) es un bug de producto, no un detalle.
- **Roles, no permisos rígidos.** Cualquiera puede ver todo, pero la **vista por defecto** de cada uno es distinta. Un toggle "Ventas / Sistema" arriba cambia el layout entero.
- **Handoff dirigido.** Cuando la IA escala, va a la cola de quien corresponda (ventas por default; sistema si es técnico).

---

## 3. Las pantallas, por prioridad

### 3.1 LA BANDEJA — el corazón (Sprint 0)
Es donde vas a vivir. Combina **inbox unificado cross-canal** + **cola de aprobación de shadow mode**. Pensala como un Superhuman para conversaciones de setter.

Layout de 3 columnas (desktop):
```
┌────────────┬───────────────────────────┬──────────────────┐
│  COLA       │   CONVERSACIÓN             │  CONTEXTO DEL    │
│             │                            │  LEAD            │
│ • Por       │  [WhatsApp · IG unificado] │                  │
│   aprobar   │                            │  Persona (cross- │
│ • Caliente  │  ...historial...           │   canal)         │
│ • Mías      │                            │                  │
│ • Handoff   │  ┌──────────────────────┐  │  Stage: QUALIF.  │
│ • Todas     │  │ DRAFT de la IA:       │  │  Dolor: ...      │
│             │  │ "Te lo muestro en..." │  │  Fit: ✓          │
│             │  │ [Aprobar ⏎] [Editar]  │  │  Timing: 2 sem   │
│             │  │ [Regenerar] [Tomar yo]│  │  Fuente: lead-eng│
│             │  └──────────────────────┘  │  Costo: $0.12    │
└────────────┴───────────────────────────┴──────────────────┘
```

El momento clave: **aprobar un draft**.
- `Enter` aprueba y envía. `E` edita inline. `R` regenera. `T` toma la conversación (pausa la IA). Sin modales.
- Mostrar **por qué la IA dijo eso**: qué tool llamó, qué dato de calificación capturó, en qué stage está. Esto es lo que te genera confianza para después soltar el shadow mode. Sin transparencia, nunca confiás y nunca pasás a autopilot.
- Si el draft va a salir como **nota de voz**, mostrar el ícono de audio + un play del preview antes de aprobar (no mandés tu voz clonada sin escucharla).
- **Indicador de ventana de 24h** por conversación: un puntito verde (abierta, respondés gratis) / ámbar (por cerrar) / gris (cerrada, sale template pago). Así ves de un vistazo la economía.

Estados: skeleton loaders mientras carga (los que ya usás), empty state copado cuando no hay nada por aprobar ("Todo al día. La IA está manejando 3 charlas 👌"), y "la IA está escribiendo…" cuando está generando.

### 3.2 PIPELINE — kanban por estado (Sprint 1)
Columnas = `LeadStatus` (NEW → CONTACTED → ENGAGED → QUALIFYING → QUALIFIED → BOOKING → BOOKED). Cada card: nombre, canal (ícono), último mensaje, tiempo en el stage. Drag para mover manual (override del estado de la IA). Click → abre la conversación en la Bandeja. Conecta directo con tu CRM propio, no es otra base aislada.

### 3.3 AGENDA — bookings + no-shows (Sprint 1)
Vista de las calls agendadas, con estado (confirmada / sin confirmar / no-show). Resalta las que no confirmaron el T-24h para que la IA (o vos) reprograme. Integración con Google Calendar.

### 3.4 DASHBOARD — unit economics (Sprint 4)
Las cards estilo las que vimos en AutoSetter, pero con la métrica que ninguno muestra: **costo por reunión agendada**.
- Reuniones agendadas (semana/mes) · Conversaciones iniciadas · Reply rate por canal (WA vs IG) · **Costo por reunión** · No-show rate · Conversión por vertical/ICP.
- Acá SÍ van charts, pero sobrios. Una línea de pipeline en vivo, no un tablero de Fórmula 1.

### 3.5 CONFIG DEL AGENTE (Sprint 0 mínimo, crece después)
El panel de Andrés, pero vos cargás el negocio:
- **Business brief** (qué vendés, ICP, criterios de calificación, oferta, FAQs, precios autorizados) → alimenta el system prompt.
- **Tono / few-shots** (editás los ejemplos bien/mal).
- **Voz**: conectar voiceId de ElevenLabs, subir muestras, definir en qué beats usar audio.
- **Canales**: conectar número de WhatsApp / cuenta de IG, estado de la conexión, quality rating.
- **Cadencia de follow-up**: editar los steps y delays.
- **El switch que más importa: Shadow ⇄ Autopilot**, por canal o global. Con un indicador grande y claro de en qué modo está cada cosa. Soltar el autopilot tiene que ser una decisión consciente, no un checkbox perdido.

### 3.6 LEAD-ENGINE (Sprint 1)
Control de la fuente: definir ICP/queries de prospección, ver leads entrando, pausar/reanudar. Es el grifo de la máquina.

---

## 4. Móvil vs desktop (clave para vos)

Vos vas a estar en la calle, en reuniones, y los leads entran en tiempo real. Entonces:

**Móvil (vos, prioridad alta):**
- **Aprobar drafts** con swipe (swipe derecha = aprobar y enviar, izquierda = editar). Es el caso de uso #1 móvil.
- **Pings de handoff y lead caliente** push, accionables desde la notificación.
- Ver la agenda del día.
- NO metas config ni analytics pesados en móvil. Eso es desktop.

**Desktop (los dos):**
- La Bandeja completa de 3 columnas, pipeline, config, métricas, logs.
- Keyboard-first de verdad (atajos para todo).

Diseñá la Bandeja **mobile-first para el flujo de aprobación** y desktop-first para todo lo demás.

---

## 5. Microinteracciones que definen la calidad

- **Aprobación en un teclazo / swipe.** Si esto tiene fricción, abandonás el shadow mode y perdés el control de la calidad.
- **"Por qué dijo esto".** Tool calls + datos capturados visibles al lado de cada draft. Es el puente a confiar y soltar el autopilot.
- **Preview de la nota de voz** antes de mandar. Tu voz clonada no sale sin que la escuches.
- **Semáforo de ventana 24h** siempre visible. Ata el UX a la economía.
- **Presencia de los dos** (quién tomó qué, quién escribe). Anti doble-respuesta.
- **Toggle Ventas/Sistema** que reconfigura la app según quién la usa.
- **Switch Shadow/Autopilot** prominente, con confirmación al soltar.

---

## 6. Estética concreta (tokens, alineado a tu Resend system)

- **Light mode** base, con dark opcional. Fondo casi blanco, no blanco puro.
- **Tipografía** con jerarquía marcada (un sans geométrico limpio tipo Inter/Geist). Números tabulares en métricas.
- **Color**: neutro dominante + 1 acento para acciones primarias (aprobar/enviar). Estados con color funcional: verde (ventana abierta / confirmado), ámbar (atención / por cerrar), gris (cerrado / inactivo), rojo solo para fallos reales.
- **Densidad alta pero respirada** — Linear/Attio, no Salesforce. Filas compactas, padding generoso en la conversación.
- **Cero decoración gratis.** Cada pixel sirve. La belleza viene de la jerarquía y la velocidad, no de efectos.
- **Skeleton loaders** (ya los usás) + transiciones cortas (120-180ms), nada lento.

---

## 7. Orden de construcción del UI (alineado a los sprints)

1. **Sprint 0:** La Bandeja (1 canal) + shadow mode + config mínima (business brief + switch shadow). Es lo único que necesitás para empezar a operar.
2. **Sprint 1:** Pipeline + Agenda + control de lead-engine.
3. **Sprint 2:** preview/manejo de notas de voz en la Bandeja.
4. **Sprint 3:** unificación visual cross-canal (IG + WA en un solo hilo) + presencia de dos operadores.
5. **Sprint 4:** Dashboard de unit economics + el switch a autopilot bien resuelto.

No construyas el dashboard de métricas antes que la Bandeja. La métrica más linda no sirve si todavía no estás operando conversaciones.

---

## En una línea

Una consola de operador rápida y keyboard-first, con la **Bandeja de aprobación shadow-mode como corazón**, dos modos (Ventas / Sistema) para vos y Andrés, mobile-first para aprobar drafts en la calle, estética Resend/Linear sobria — donde la velocidad de *tu* trabajo es tan importante como la velocidad con la que la IA responde a los leads.
