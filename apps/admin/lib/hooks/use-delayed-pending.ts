import { useEffect, useState } from 'react'

/**
 * useDelayedPending — devuelve `true` solo si `pending` se mantiene activo más
 * de `delay` ms. Sirve para diferir la aparición del skeleton/spinner y evitar
 * el flash en cargas rápidas (umbral ~300ms, guía de skeletons + NN/g): si el
 * dato llega antes del umbral, el indicador NUNCA se muestra.
 *
 * Uso:
 *   const showSkeleton = useDelayedPending(isPending)
 *   return showSkeleton ? <TableSkeleton /> : <Table data={data} />
 *
 * Nota: con `placeholderData: keepPreviousData` (default global del QueryClient),
 * `isPending` ya es false en los refetch por cambio de clave, así que esto solo
 * difiere la carga INICIAL real.
 */
export function useDelayedPending(pending: boolean, delay = 300): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!pending) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(timer)
  }, [pending, delay])

  return show
}
