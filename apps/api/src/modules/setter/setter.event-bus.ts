import { EventEmitter } from 'node:events'

/** Evento del setter que se empuja por WebSocket (en vivo). */
export interface SetterLiveEvent {
  id: string
  tenantId: string
  level: string
  type: string
  message: string
  leadId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

/** Bus en memoria: logSetterEvent emite, el WS reenvía a los sockets conectados. */
class SetterEventBus extends EventEmitter {}
export const setterEventBus = new SetterEventBus()
setterEventBus.setMaxListeners(0) // sin límite (un socket = un listener)

export function emitSetterEvent(event: SetterLiveEvent): void {
  setterEventBus.emit('event', event)
}
