'use client'

/**
 * Autoguardado con debounce para un campo editable (texto, color, etc.),
 * compartido entre el portal (`onboarding-brand-section.tsx`) y el admin
 * (`components/companies/company-brand-card.tsx`,
 * `app/admin/(dashboard)/onboarding/[dealId]/page.tsx`) — ambos editan
 * branding con el mismo patrón: debounce + flush on blur + estado visible de
 * guardado. Antes cada campo (NameField, ColorField, BrandIdentityEditor ×2)
 * reimplementaba esto a mano, con 3 bugs repetidos en cada copia:
 *
 *  1. Closure vieja: `setTimeout(() => void commit(), 800)` leía `text`/
 *     `trimmed` del render en el que se armó el timeout, NO del más reciente.
 *     El PATCH debounced mandaba el valor ANTERIOR a la última tecla (o, si
 *     ese valor anterior era inválido, no mandaba nada). Acá `schedule`/
 *     `commit` reciben el valor como ARGUMENTO explícito — nunca leen estado
 *     de un closure capturado.
 *  2. Respuestas fuera de orden: si el usuario dispara dos guardados y el más
 *     viejo resuelve DESPUÉS del más nuevo, pisaba `lastSavedRef`/la caché/el
 *     "Guardado" con datos vencidos. Acá cada `commit` saca un id de una ref
 *     monotónica (`requestIdRef`); solo la respuesta cuyo id sigue siendo el
 *     vigente al resolver puede tocar `lastSavedKeyRef`/el estado/el error.
 *  3. Guardado perdido al desmontar: los cleanups anteriores solo hacían
 *     `clearTimeout`, así que una edición dentro de la ventana de debounce se
 *     perdía si el componente se desmontaba (cambio de tab de Radix, de
 *     ruta). Acá el cleanup de desmontaje DISPARA el guardado pendiente — la
 *     promesa puede resolver después de desmontado, por eso todo `setState`
 *     está guardado por `mountedRef`.
 */

import { useEffect, useRef, useState } from 'react'

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface UseAutosaveFieldOptions<T> {
  /** Valor persistido en el servidor — sincroniza el campo cuando cambia por fuera (otro tab, refetch). */
  serverValue: T
  /** Clave de comparación para decidir si "cambió" — ej. `trim()` para texto, `toLowerCase()` para hex. Por defecto, `String(value)`. */
  toKey?: (value: T) => string
  /** Si el valor es válido para guardar. Uno inválido nunca se envía. */
  isValid: (value: T) => boolean
  /** Persiste el valor. Puede lanzar — el hook captura el error y lo expone en `error`. */
  save: (value: T) => Promise<unknown>
  /** ms de debounce para `schedule`. 0 (default) desactiva el auto-schedule — solo `commit`/`flush` manual (ej. on blur/Enter). */
  debounceMs?: number
  /** ms que se muestra el estado "saved" antes de volver a "idle". Default 2500. */
  savedResetMs?: number
}

export interface UseAutosaveFieldResult<T> {
  value: T
  setValue: (value: T) => void
  state: AutosaveState
  error: string | null
  /** Programa un guardado debounced con ESTE valor. */
  schedule: (value: T) => void
  /** Guarda de inmediato lo pendiente (si hay), cancelando el debounce — para onBlur. */
  flush: () => void
  /** Guarda un valor puntual ahora, sin pasar por el debounce (ej. reintentar, o campos sin auto-schedule). */
  commit: (value: T) => Promise<void>
}

export function useAutosaveField<T>(options: UseAutosaveFieldOptions<T>): UseAutosaveFieldResult<T> {
  const { serverValue, isValid, save, debounceMs = 0, savedResetMs = 2500 } = options
  const toKey = options.toKey ?? ((v: T) => String(v))

  const [value, setValueState] = useState<T>(serverValue)
  const [state, setState] = useState<AutosaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const lastSavedKeyRef = useRef(toKey(serverValue))
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<T | null>(null)
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs "vivas": `isValid`/`save`/`toKey` son funciones inline en el caller
  // (cambian de identidad en cada render) — leerlas desde una ref evita que
  // `commit`/`schedule` (funciones estables, no recreadas) queden atadas a la
  // versión del render en el que se definieron.
  const isValidRef = useRef(isValid)
  isValidRef.current = isValid
  const saveRef = useRef(save)
  saveRef.current = save
  const toKeyRef = useRef(toKey)
  toKeyRef.current = toKey

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Solo re-sincroniza si el servidor trae un valor distinto al último que
  // NOSOTROS guardamos — evita pisarle al usuario lo que está tipeando ante
  // un refetch en segundo plano.
  useEffect(() => {
    const key = toKeyRef.current(serverValue)
    if (key !== lastSavedKeyRef.current) {
      setValueState(serverValue)
      lastSavedKeyRef.current = key
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverValue])

  async function commit(v: T): Promise<void> {
    const key = toKeyRef.current(v)
    if (!isValidRef.current(v) || key === lastSavedKeyRef.current) return
    const myId = ++requestIdRef.current
    if (mountedRef.current) {
      setState('saving')
      setError(null)
    }
    try {
      await saveRef.current(v)
      // Ya hay una request más nueva en curso (o resuelta) — esta quedó vieja, se ignora.
      if (myId !== requestIdRef.current) return
      lastSavedKeyRef.current = key
      if (mountedRef.current) {
        setState('saved')
        if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current)
        savedResetTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setState('idle')
        }, savedResetMs)
      }
    } catch (err) {
      // Un error de una request vieja no debe tapar un guardado más nuevo que sí funcionó.
      if (myId !== requestIdRef.current) return
      if (mountedRef.current) {
        setState('error')
        setError(err instanceof Error ? err.message : 'No se pudo guardar')
      }
    }
  }

  function schedule(v: T) {
    pendingRef.current = v
    if (timerRef.current) clearTimeout(timerRef.current)
    if (debounceMs <= 0) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const pv = pendingRef.current
      pendingRef.current = null
      if (pv != null) void commit(pv)
    }, debounceMs)
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pv = pendingRef.current
    pendingRef.current = null
    if (pv != null) void commit(pv)
  }

  // Al desmontar: si queda un guardado debounced pendiente, se dispara igual
  // — el fetch puede terminar después de desmontado (`commit` solo toca
  // estado local si `mountedRef.current` sigue en true).
  useEffect(() => {
    return () => {
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const pv = pendingRef.current
        pendingRef.current = null
        if (pv != null) void commit(pv)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setValue(v: T) {
    setValueState(v)
  }

  return { value, setValue, state, error, schedule, flush, commit }
}
