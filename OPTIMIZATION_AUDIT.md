# Auditoría de performance — 2026-06-14

> Rama: `perf/optimizations`. Metodología: medir antes de tocar. El baseline de DB se
> tomó sobre un **seed sintético a escala** (`perf/seed-baseline.sql`) porque la DB de dev
> estaba vacía (1 deal, 1 contacto) y un `EXPLAIN` sobre tablas de 1 fila no es evidencia.
> El baseline de frontend se tomó con `@next/bundle-analyzer` + `next build`.

---

## Resumen ejecutivo (lo que la MEDICIÓN cambió)

La hipótesis intuitiva sería "agregar índices a la DB". **La medición la desmiente.** Con un
dataset ya generoso para una agencia de 2 personas (8k deals, 20k contactos, 30k tareas,
150k de historial, 6k facturas), **todas las queries calientes corren entre 0.04ms y 12.7ms**.
La DB **no es el cuello de botella** y sus índices están bien diseñados.

Los retornos reales, en orden de impacto medido:

1. **Frontend / bundle inicial** — recharts (~entra en 3 rutas), `ogl` (WebGL) y `framer-motion`
   se cargan **eager**, y `next/dynamic` **no se usa en ningún lado** (0 ocurrencias). Es el
   mayor costo *percibido por el usuario* (JS en el first load).
2. **Trabajo pesado síncrono en el request** — prospecting (Places + scrape + LLM) bloquea
   10–60s; `generateProposal` (LLM) bloquea 5–20s. Esto eclipsa cualquier query de 8ms.
   ⚠️ Offloadear a job **cambia el contrato** (sync→async) → decisión de producto.
3. **Agregaciones en JS sobre fetches sin límite** (finanzas) — hoy ~2–6ms, pero traen filas
   completas a Node y crecen sin techo. Pasarlas a SQL es seguro (misma salida) y barato.
4. **Índices de listas faltantes** (`created_at`, `email_send.deal_id`) — impacto absoluto bajo
   HOY (8ms→<1ms), pero es seguro de crecimiento y de bajísimo esfuerzo.

---

## Baseline

### DB — queries calientes (seed sintético, `EXPLAIN ANALYZE`)

| # | Query (módulo) | Tiempo | Plan | Diagnóstico |
|---|----------------|--------|------|-------------|
| Q1 | Deals list (`deals.service`) | 8.4 ms | **Seq Scan 7359 + top-N heapsort** | Falta índice `created_at` → ordena en memoria |
| Q2 | Contacts list (`contacts.service`) | 8.2 ms | **Seq Scan 19049 + top-N heapsort** | Ídem Q1 |
| Q4 | Finance summary fetch invoices | 2.2 ms | Seq Scan 2901 (width=234, fila completa) | Trae todo a Node para sumar/contar en JS |
| Q4b | Finance summary como agg SQL | 2.3 ms | HashAggregate | Mismo tiempo, pero **transfiere solo los números** |
| Q5 | Outstanding (join propuesto) | 6.5 ms | Hash join + bitmap idx invoice | El join SQL ya usa `idx_invoice_portal_status` |
| Q6a | Timeline email_send by deal | 3.4 ms | **Seq Scan 20k (Rows Removed 19999)** | **Sin índice `email_send.deal_id`** |
| Q6b | Timeline email_event (unidad N+1) | 0.05 ms | Index Only Scan `(email_id,type)` | Índice OK; el problema es el N×round-trip |
| Q6c | Timeline notes by deal | 0.21 ms | Bitmap `idx_note_deal` | OK |
| Q7 | Focus last-activity (calls) | 12.7 ms | **Seq Scan 25k + HashAggregate** | Agg full-scan por entidad |
| Q8 | Dashboard funnel | 2.9 ms | Hash right join | OK |
| Q9 | Reports conversion by source (JSONB) | 6.4 ms | **Seq Scan 19049 + parse JSONB** | `custom->>'source'` sin índice funcional |
| Q10 | Finance monthly (`to_char` group) | 5.6 ms | Seq Scan 12k | `to_char` impide index-only |
| Q11 | record_history by entity | **0.04 ms** | **Index Scan compuesto** | Índice perfecto ✅ |
| Q12 | Tasks list (cap 200) | 11.5 ms | **Seq Scan 30k + top-N heapsort** | Falta índice `created_at` |

**Tamaños de tabla del baseline:** record_history 57MB/150k, note 14MB/40k, task 14MB/30k,
contact 19MB/20k, email_event 8MB/50k, deal 4MB/8k, invoice 1.9MB/6k.

**Conclusión DB:** ningún plan supera 13ms. Hay seq scans, pero sobre tablas chicas. Los
índices existentes son buenos; los faltantes son seguro de crecimiento, no urgencia.

### API — endpoints más pesados (no por query, por trabajo en el request)

| Endpoint | Costo dominante | Tipo |
|----------|-----------------|------|
| `POST /prospecting/search` | Google Places + N scrapes + N llamadas Vertex LLM (10–60s) | I/O externo síncrono |
| `POST /proposals/generate` | LLM Claude/Gemini (5–20s) | I/O externo síncrono |
| `GET /contacts/:id/next-action` (IA) | LLM (1–5s) | I/O externo síncrono |
| `GET /finance/invoices/:id/pdf` | easyinvoice (CPU) + `import()` por request | CPU + bloqueo event loop |
| `POST /public/calendar/.../book` | 2× Resend secuenciales (~1–2s) | I/O externo secuencial |

### Frontend — bundle por ruta (`next build` + analyzer)

| Ruta | First Load JS | Causa probable |
|------|---------------|----------------|
| `/admin/finance/[section]` | **323 kB** | recharts × 4 (Bar+Pie+Bar+panel) — outlier |
| `/admin/tasks` | 231 kB | tabla grande + cap 200 |
| `/admin/deals/[id]` | 230 kB | 1141 líneas, 10 queries, 9 tabs sin split |
| `/admin/reports` | 227 kB | recharts (2 BarCharts + ChartContainer wildcard) |
| `/admin/setter` | 223 kB | UI de chat del agente |
| `/admin/dashboard` | 217 kB | recharts (ruta más visitada) |
| `/admin/pipeline` | 216 kB | `@dnd-kit/core` |
| `/admin/follow-ups` | 213 kB | — |
| `/admin/{clients,contacts,leads}/[id]` | 212 kB | detalle + waterfall next-action |
| `/admin/proposals/[id]` | 197 kB | `ogl` (WebGL) + `framer-motion` |
| **Shared global (todas)** | **87.5 kB** | framework 53.6kB + 31.8kB (sano) |

Treemap del analyzer: `apps/admin/.next/analyze/client.html`.

**Señales estructurales (medidas):**
- `next/dynamic`: **0 usos en todo el admin** → nada está code-splitteado.
- `"use client"`: **109 de 131 archivos** (83%).
- `import * as RechartsPrimitive from "recharts"` en `components/ui/chart.tsx:4` → rompe tree-shaking.
- `ogl` (WebGL) importado eager en `components/proposals/side-rays.tsx:4`.
- `framer-motion` eager en 3 rutas (prospecting, proposals, onboarding).
- `useUnreadCount` (`lib/hooks/misc.ts:23`) poll cada 60s en toda página autenticada.

---

## Oportunidades (ordenadas por impacto medido)

### [Alto / Bajo-Medio] FE-1 · Code-splitting de recharts + ogl con `next/dynamic`
- Categoría: frontend
- Ubicación: `dashboard/page.tsx`, `reports/page.tsx`, `finance/.../ResumenSection.tsx`, `components/proposals/proposal-deck.tsx:9` (→ `side-rays.tsx`)
- Evidencia: recharts ~200KB + `ogl` ~40-80KB cargados eager; `next/dynamic` 0 usos. (KB exactos: ver tabla bundle).
- Mejora esperada: bajar el First Load JS de dashboard/reports/finance/proposals. Riesgo: charts aparecen con un tick de delay (loading). Verificación: las rutas renderizan igual; los charts muestran los mismos datos.

### [Alto / Bajo] FE-2 · Named import de recharts en `chart.tsx`
- Ubicación: `components/ui/chart.tsx:4`
- Evidencia: `import * as RechartsPrimitive` desactiva tree-shaking de todo recharts.
- Mejora esperada: reduce el chunk de recharts en las 3 rutas que usan `ChartContainer`. Riesgo: nulo. Verificación: build OK + charts idénticos.

### [Alto / Medio] API-1 · Agregaciones JS → SQL en finanzas (seguro, misma salida)
- Categoría: DB/API
- Ubicación: `finance.service.ts:1008` (financeSummary), `:692` (expenseSummary), `:1059`/`:1173` (outstanding/topDebtors)
- Evidencia: Q4 trae 2901 filas completas (width=234) a Node para un SUM/COUNT; `expenseSummary` trae TODO sin filtro de fecha. Q4b prueba que la agg SQL da el mismo tiempo transfiriendo solo los números.
- Mejora esperada: payload Node↓ y escala lineal eliminada. Riesgo: bajo (mismos totales). Verificación: comparar JSON de `/finance/summary` y `/finance/expenses/summary` antes/después byte a byte.

### [Alto / Medio-Alto · CAMBIA CONTRATO] API-2 · Offload de prospecting + generateProposal a BullMQ
- Ubicación: `prospecting.service.ts:96`, `proposals.service.ts:153`
- Evidencia: bloquean la conexión 10–60s y 5–20s respectivamente.
- ⚠️ **Cambia el comportamiento** (sync→async + polling). No es "perf puro". Requiere decisión de producto y cambios de UI. **Lo separo del resto.**

### [Medio / Bajo] API-3 · Fire-and-forget de emails y notificaciones (seguro)
- Ubicación: `calendar.service.ts:545` (2 Resend secuenciales), `notifications.service.ts:111` (`notifyAdmins` inserts secuenciales)
- Evidencia: I/O externo en el path del request; resultado de negocio idéntico si se hace tras responder.
- Mejora esperada: −1–2s en booking, −Ninserts en cada acción. Riesgo: bajo (los emails/notifs igual se envían). Verificación: booking devuelve igual; emails llegan.

### [Medio / Bajo] DB-1 · Índices de listas faltantes (seguro de crecimiento)
- Ubicación: `deal`, `contact`, `task` (orden `created_at`), `email_send.deal_id`
- Evidencia: Q1/Q2/Q12 hacen Seq Scan + top-N sort; Q6a Seq Scan 20k sin `deal_id`.
- Propuesta: índices parciales `(portal_id, created_at DESC, id DESC) WHERE archived=false` y `email_send(deal_id)`. Vía `db:generate`.
- Mejora esperada: 8–12ms → <1ms (elimina el sort). Riesgo: nulo (solo lectura del planner). Verificación: re-EXPLAIN muestra Index Scan sin Sort.

### [Medio / Medio] API-4 · Paginación en listas sin límite
- Ubicación: `finance.service.ts:184` (listInvoices, sin LIMIT), `:414` (listPayments), `work-items.service.ts:23`
- Evidencia: retornan toda la tabla del portal.
- ⚠️ Cambia la salida (trunca/pagina) → leve cambio de comportamiento en UI. Verificación: UI con paginación.

### [Medio / Bajo] API-5 · N+1 timeline email_event en batch
- Ubicación: `timeline.service.ts:185`
- Evidencia: `for` con un SELECT por email (hasta 50+ round-trips). El índice existe; el problema es la cantidad de viajes.
- Propuesta: un `WHERE email_id = ANY(...) GROUP BY email_id`. Riesgo: bajo. Verificación: timeline idéntico.

### [Bajo / Bajo] FE-3 · `"use client"` innecesario + `next/image` para logos
- Ubicación: `app/admin/(dashboard)/layout.tsx:1`, `leads/page.tsx`, `prospecting/page.tsx`, `empty-illustration.tsx`; `<img>` en `WhiteLabelSection.tsx:132`, `brand-kit-form.tsx:177`
- Evidencia: layout/páginas wrapper sin hooks marcados client; logos con `<img>` plano.
- Mejora esperada: chunk de layout menor; logos optimizados. Riesgo: bajo. Verificación: render igual.

---

## Descartado por bajo impacto (medido)

- **Agregar índices "por las dudas" a la DB** como prioridad: la medición muestra <13ms en todo. Solo los de DB-1 valen, y como seguro de crecimiento, no por urgencia.
- **Optimizar el funnel del dashboard / record_history**: ya usan índices/joins eficientes (2.9ms / 0.04ms).
- **`lucide-react` split imports**: tree-shakeable por nombre, impacto nulo (solo higiene).
- **Micro-memoization de re-renders**: sin medición de un problema concreto, no se toca.

---

## Guardrails a verificar en cada cambio
- Soft-delete (`archived=false`) intacto en toda query tocada.
- Transacciones multi-tabla preservadas.
- Envelope `{ data, meta }` / `{ error }` sin cambios.
- `record_history` se sigue escribiendo en los services.
- Single-tenant hoy, pero **ningún cambio puede romper el aislamiento por `portal_id`** si entra multi-portal.
- typecheck + lint + tests en verde antes y después.
