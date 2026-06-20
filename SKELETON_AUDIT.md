# Auditoría de Loading States / Skeleton Screens — NOUS CRM

> Alcance: TODA la app (`apps/admin`) — panel admin + portal cliente + rutas públicas
> (onboarding, booking, propuesta). Rúbrica: NN/g + web.dev + accesibilidad (la guía de skeletons del proyecto).
> Fecha: 2026-06-14.

---

## ✅ Estado: IMPLEMENTACIÓN COMPLETA (2026-06-14)

Toda la auditoría fue implementada. Typecheck del admin limpio.
- **Fundaciones**: fix `animate-pulse` reduced-motion, primitivo `<Skeleton>` con `aria-hidden`, `<LoadingRegion>`/`<SkeletonGroup>`, composites fieles (`TableSkeleton`/`KanbanSkeleton`/`DetailViewSkeleton`/`CardGridSkeleton`/`ListSkeleton`), `useDelayedPending(300)`. Espejo en el portal (`portal-lib/components/ui/`).
- **38 archivos** migrados a composites fieles; **16** con skeletons compuestos a medida.
- **Crítico**: calendario público (book + reschedule) — slots + metadata + `loading.tsx`.
- **Admin**: tablas (thead), boards (kanban horizontal por view mode), 5 detail views (fin del "2 rectángulos"), dashboard/reports/finance/timeline/follow-ups/calendar/prospecting.
- **Portal**: 6 paneles spinner→skeleton, error parcial en home, race de branding, layout fiel.
- **Públicas**: propuesta (shell + `loading.tsx`), onboarding (token/aria/WebGL), `book/cancel` a11y, **bug B-5** (error vs vacío) corregido.
- Único spinner de página intencional: `book/cancel` (one-shot, con `role=status`).

---

## Veredicto general (original)

- **0** vistas de datos con skeleton **fiel** en portal y rutas públicas.
- **~4** skeletons fieles en admin (settings/campos, setter detalle, parcialmente finance/reports).
- **~23** skeletons **genéricos** en admin (rectángulos que NO imitan el layout → CLS).
- **8** spinners en rutas públicas (las pantallas de cara al cliente son las PEORES).
- Inversión de prioridad: `/admin` tiene 4 `loading.tsx`; las rutas públicas tienen **0**.

---

## Hallazgos transversales (ordenados por palanca)

### T1 — ~~Admin NO usa `keepPreviousData`~~ → DESCARTADO (ya está resuelto)
**Corrección:** el agente de admin concluyó esto buscando solo en `/lib/hooks/`. Es FALSO.
`app/providers.tsx:28` YA define `placeholderData: keepPreviousData` en el default global del `QueryClient` (igual que el portal en `portal-lib/providers.tsx:22`). Ningún hook lo sobreescribe y **ningún componente usa `isFetching`** para disparar skeleton (verificado por grep).
**Consecuencia real:** el parpadeo "en cada cambio de filtro" NO ocurre — los componentes que usan `isPending`/`isLoading` mantienen el dato previo al cambiar de clave. El skeleton solo aparece en la **carga inicial** (sin dato previo), que es el comportamiento correcto.
**Implicancia:** la palanca alta NO es infra de Query (ya está bien) sino **fidelidad** (T5/T6) + **accesibilidad** (T2/T3). El problema de los skeletons genéricos es CLS en la carga inicial, no parpadeo en refetch.

### T2 — `prefers-reduced-motion` NO cubre `animate-pulse` · MEDIA (a11y, fix 1 línea)
El primitivo `<Skeleton>` (admin y portal, idénticos) usa `animate-pulse`. El guard de `app/globals.css:241` solo neutraliza `animate-float/glow-breathe/plop*` — **no** `animate-pulse`.
**Consecuencia:** quien pidió menos movimiento ve TODOS los skeletons pulsando. Incumple la guía (punto 4) y WCAG.
**Fix:** agregar `.animate-pulse { animation: none; }` a ese bloque `@media`. Cubre admin + portal en una línea (globals.css es global).

### T3 — Accesibilidad ausente en TODOS los skeletons · MEDIA
Ningún skeleton tiene `aria-hidden` en las barras, ni `aria-busy`/`role="status"` en el contenedor, ni anuncio único de "Cargando…" en live region. Hay markup que oculta tabs estáticos durante la carga (deberían verse ya).
**Fix:** endurecer el primitivo `<Skeleton>` (default `aria-hidden`) + un wrapper `<LoadingRegion aria-busy role=status sr-only>` reutilizable.

### T4 — Cero umbral de ~300ms · BAJA
Ningún estado de carga difiere su aparición. En red local el skeleton/spinner parpadea por <100ms (glitch). Falta un `useDelayedFlag(300)` o `useDelayedPending`.

### T5 — Skeleton "2 rectángulos" copy-paste en 5 detail views distintos · ALTA
`loading.tsx` de leads/contacts/clients + estados `isLoading` de `ContactDetailView`, `DealDetailPage`, `CompanyDetailPage` comparten el mismo placeholder (`h-96 w-80` + `h-96 flex-1`) para layouts internos completamente diferentes. Máxima infidelidad.

### T6 — Skeletons que no coinciden con el layout real (CLS severo) · ALTA
- **Kanban** (`pipeline/page.tsx:73`, `leads-view.tsx`, `tasks-view.tsx`): skeleton en grilla vertical, pero el real es `flex` horizontal con columnas `w-72`. Salto garantizado.
- **Tablas** (people, deals, companies, finance ×3, projects): 3 rectángulos `h-12` sin `thead` ni columnas → el encabezado aparece de golpe.
- **`leads/[id]/loading.tsx`**: contiene un `useEffect` de **debug (console.warn)** que debe salir de producción.

### T7 — Rutas públicas: el `setSlots([]) → spinner` del calendario · CRÍTICA
En `book/[portalId]/[slug]` y `book/reschedule`, cada clic en un día (y cada cambio de timezone) hace `setSlots([]) + setLoadingSlots(true)`: la grilla de slots desaparece, colapsa a un spinner chico y el layout salta en altura. Es la peor UX de carga de la app y está en la pantalla de cara al cliente. No usan TanStack Query (fetch+useState manual) → sin `keepPreviousData` posible sin refactor.

---

## Hotspots por prioridad

### CRÍTICA (cara al cliente, CLS severo) — ✅ HECHO
| Ubicación | Problema | Acción | Estado |
|---|---|---|---|
| `book/[portalId]/[slug]/page.tsx` | grilla de slots + metadata con spinner, CLS al cambiar día/TZ | `<SlotsSkeleton>` + `<BookingPageSkeleton>` (2 columnas) + `loading.tsx` | ✅ |
| `book/reschedule/page.tsx` | idéntico (copy-paste de book) | `<SlotsSkeleton>` + `<ReschedulePageSkeleton>` (1 columna) + `loading.tsx` | ✅ |

Skeletons fieles grises (paleta neutra de las páginas públicas) en `app/book/_components/booking-skeletons.tsx`,
envueltos en `<SkeletonGroup>` (a11y: role=status + aria-busy + sr-only). Pendiente menor: distinguir
estado de error vs "día sin slots" (B-5, `catch(() => setSlots([]))` hace que un error parezca vacío) y
`role=status` en el spinner one-shot de `book/cancel` (C-1).

### ALTA
| Ubicación | Problema | Acción |
|---|---|---|
| `dashboard/page.tsx:262`, `pipeline/page.tsx:73` | skeleton genérico, kanban no coincide | skeleton fiel por layout |
| `contact-detail-view.tsx:241` + 3 detail pages + 3 `loading.tsx` (T5) | 2-rectángulos para 5 layouts | skeleton fiel por entidad |
| `leads-view.tsx:319`, `tasks-view.tsx:264` | skeleton de grilla para vista board | skeleton por view mode (board/table/list) |
| `people-section.tsx:57`, `deals/page.tsx:54`, `companies/page.tsx:113` | tablas sin thead | `<TableSkeleton>` con encabezado |
| portal: `home/deliverables/forms/requests-panel` | spinner+texto en pantallas de acción del cliente | skeleton fiel de cards |
| portal: `home-panel` | no maneja error parcial (4 queries, solo `isLoading`) | rama `isError` |
| portal: `BrandKitForm` | race: estados iniciales default antes de hidratar | iniciar en `null`/`undefined` |
| `app/p/[token]` y book/*: sin `loading.tsx` de segmento | sin Suspense boundary | crear `loading.tsx` con skeleton del shell |

### MEDIA
Finance (resumen/facturas/cobros/gastos), reports, invoices/[id], change-requests/[id], proposals, projects, onboarding admin: skeletons genéricos → fieles. Portal: invoices/documents/branding panels. Accesibilidad (T3) en todos los contenedores. Flash de identidad del branding en header/login del portal.

### BAJA
Calendario admin (EventTypeList, BookingsManager, WeekView), umbral 300ms (T4), `role="alert"` en errores de rutas públicas, fallback de color del fondo WebGL (SideRays) en onboarding/propuesta.

---

## Plan de ejecución recomendado (de mayor a menor palanca)

1. **Fundaciones transversales** (tocan toda la app, bajo riesgo):
   - ~~`keepPreviousData`~~ → ya existe (T1 descartado).
   - `.animate-pulse { animation: none; }` en el guard de globals.css (T2).
   - Endurecer primitivo `<Skeleton>` con `aria-hidden` + crear `<LoadingRegion>` (T3).
   - Helper `useDelayedPending(300)` (T4).
   - Primitivos reutilizables: `<TableSkeleton>`, `<KanbanSkeleton>`, `<CardGridSkeleton>`, `<DetailViewSkeleton>`.
2. **CRÍTICA**: calendario público (book + reschedule) — slots + metadata + `loading.tsx`.
3. **ALTA admin**: dashboard, pipeline, detail views (5), listados-tabla, leads/tasks por view mode.
4. **ALTA portal**: paneles de acción (home/deliverables/forms/requests) + error parcial + race de branding.
5. **MEDIA**: finance, reports, detalles, propuesta pública, accesibilidad restante.
6. **BAJA**: calendario admin, 300ms fino, `role="alert"`, fallback WebGL.

---

## Conteos

| Zona | Skeleton fiel | Genérico | Spinner (página) | Vacío/null | `loading.tsx` |
|---|---|---|---|---|---|
| Admin | ~4 | ~23 | 0 (solo en botones, OK) | 1 | 4 |
| Portal | 1 (parcial) | 1 | 6 | 2 (flash identidad) | 0 |
| Públicas | 0 | 0 | 8 | 2 | 0 |
