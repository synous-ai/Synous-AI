/**
 * Integración con dolarapi.com — cotizaciones ARS/USD.
 *
 * Expone `getDolarRates()` que devuelve el tipo de cambio blue y tarjeta.
 * La respuesta se cachea ~10 minutos en memoria para no pegarle a la API en
 * cada request de creación de factura/gasto. Si el fetch falla, se devuelve
 * la última caché conocida (degradación graceful). Si no hay caché previa,
 * se lanza un AppError 503 con un mensaje claro.
 *
 * dolarapi es una API pública sin key — no requiere variable de entorno.
 * Documentación: https://dolarapi.com/docs/
 */

import { Errors } from './errors'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface DolarRate {
  /** Precio de compra ARS por 1 USD. */
  compra: number
  /** Precio de venta ARS por 1 USD. Usar este como exchange_rate en montos. */
  venta: number
  /** Fecha de última actualización reportada por dolarapi. */
  fecha: string
}

export interface DolarRates {
  blue: DolarRate
  tarjeta: DolarRate
}

// Respuesta cruda de dolarapi para cada endpoint de tipo de cambio
interface DolarApiResponse {
  moneda: string
  casa: string
  nombre: string
  compra: number
  venta: number
  fechaActualizacion: string
}

// ── Caché en memoria ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutos

interface Cache {
  rates: DolarRates
  fetchedAt: number // Date.now()
}

let cache: Cache | null = null

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Llama a un endpoint de dolarapi y mapea la respuesta al tipo interno.
 * Lanza si el fetch falla o la respuesta no es 2xx.
 */
async function fetchRate(url: string): Promise<DolarRate> {
  // Usamos fetch nativo (Node 18+). El repo no tiene un cliente HTTP centralizado
  // para llamadas externas (prospecting usa axios directamente en su módulo).
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // Timeout explícito usando AbortSignal (Node 18+)
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    throw new Error(`dolarapi respondió ${res.status} para ${url}`)
  }

  const json = (await res.json()) as DolarApiResponse

  return {
    compra: json.compra,
    venta: json.venta,
    fecha: json.fechaActualizacion,
  }
}

// ── Función pública ───────────────────────────────────────────────────────────

/**
 * Devuelve las cotizaciones ARS/USD (blue + tarjeta) con caché de 10 minutos.
 *
 * Uso al crear una factura o gasto en ARS:
 *   const { blue } = await getDolarRates()
 *   const exchangeRate = blue.venta  // ARS por 1 USD
 *   const amountBase = round(amountArs / exchangeRate, 2)
 *
 * @throws AppError 503 si el fetch falla y no hay caché previa.
 */
export async function getDolarRates(): Promise<DolarRates> {
  // Devolvemos caché si está vigente (< 10 min)
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates
  }

  try {
    // Llamadas en paralelo para minimizar latencia
    const [blue, tarjeta] = await Promise.all([
      fetchRate('https://dolarapi.com/v1/dolares/blue'),
      fetchRate('https://dolarapi.com/v1/dolares/tarjeta'),
    ])

    const rates: DolarRates = { blue, tarjeta }
    cache = { rates, fetchedAt: Date.now() }
    return rates
  } catch (err) {
    // Degradación graceful: si hay caché anterior (aunque vencida) la devolvemos.
    // Esto evita bloquear la creación de facturas por una caída transitoria de dolarapi.
    if (cache) {
      console.warn('[fx] dolarapi no disponible — usando caché anterior:', (err as Error).message)
      return cache.rates
    }

    // Sin caché previa: no podemos operar — lanzamos un error claro al cliente.
    console.error('[fx] dolarapi no disponible y sin caché:', (err as Error).message)
    throw Errors.internal(
      'No se pudo obtener la cotización del dólar. Intentá de nuevo en unos segundos.',
    )
  }
}

/**
 * Invalida la caché manualmente. Útil en tests para aislar comportamiento.
 */
export function clearFxCache(): void {
  cache = null
}
