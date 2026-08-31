/**
 * Copy estático del onboarding post-venta, compartido entre el wizard del
 * cliente (Client Portal) y la vista de detalle del admin.
 *
 * Antes vivía duplicado: las 16 preguntas del brief + títulos de bloque en
 * step-6-brief.tsx (`BLOCKS`) Y de nuevo en [dealId]/page.tsx
 * (`BRIEF_BLOCKS`, con redacción distinta); las 4 categorías de materiales en
 * step-7-materials.tsx (`CATEGORIES`) y en [dealId]/page.tsx
 * (`MATERIAL_CATEGORIES`); `TOTAL_STEPS` en wizard-shell.tsx y en
 * app/admin/(dashboard)/onboarding/page.tsx.
 *
 * Los labels del brief están en SEGUNDA PERSONA (dirigidos al cliente, "vos")
 * — el admin reusa el mismo texto tal cual al mostrar las respuestas del
 * cliente; no se mantienen dos redacciones.
 */

import type { OnboardingBriefAnswers, OnboardingMaterialCategory } from './types'

export const TOTAL_STEPS = 8

// ─── Brief (paso 6): 16 preguntas en 5 bloques ───────────────────────────────

export interface OnboardingBriefFieldDef {
  key: Exclude<keyof OnboardingBriefAnswers, 'deliveryChannels' | 'deliveryChannelsOther'>
  label: string
}

export interface OnboardingBriefBlockDef {
  title: string
  fields: OnboardingBriefFieldDef[]
  /** true solo en el bloque 1: además incluye el selector de canales de entrega. */
  withChannels?: boolean
  /** true solo en el bloque 5: insumo directo para marketing, se destaca en el admin. */
  marketing?: boolean
}

export const ONBOARDING_BRIEF_BLOCKS: OnboardingBriefBlockDef[] = [
  {
    title: 'Tu negocio y tu programa',
    withChannels: true,
    fields: [
      { key: 'businessProgram', label: 'Contanos en pocas líneas: ¿qué es tu programa/metodología y a quién se lo vendés hoy?' },
      { key: 'activeClients', label: '¿Cuántos alumnos/clientes activos tenés hoy? ¿Cuántos esperás sumar en los próximos 6–12 meses?' },
    ],
  },
  {
    title: 'El problema real',
    fields: [
      { key: 'worstChannel', label: 'De todo lo que marcaste en la pregunta anterior, ¿qué es lo que menos te está funcionando hoy?' },
      { key: 'weeklyTimeDrain', label: '¿Qué es lo que más tiempo o energía te consume en la entrega de tu programa, semana a semana?' },
      { key: 'sixMonthConcern', label: 'Si esto sigue igual seis meses más, ¿qué es lo que más te preocupa que pase?' },
    ],
  },
  {
    title: 'La visión — a dónde querés llegar',
    fields: [
      { key: 'idealDayToDay', label: 'Si tu plataforma ya estuviera funcionando perfecto, ¿qué sería distinto en tu día a día?' },
      { key: 'desiredStudentFeeling', label: '¿Qué querés que sientan tus alumnos cuando entren a tu plataforma?' },
      { key: 'referenceApps', label: '¿Hay alguna app o plataforma (de cualquier rubro) que te guste como referencia de experiencia?' },
    ],
  },
  {
    title: 'Info técnica y operativa',
    fields: [
      { key: 'teamRoles', label: '¿Tenés equipo/colaboradores que también van a usar la plataforma? ¿Qué rol cumple cada uno?' },
      { key: 'brandIdentity', label: '¿Ya tenés identidad de marca definida (logo, colores, tipografías)?' },
      { key: 'requiredIntegrations', label: '¿Hay alguna herramienta con la que sea indispensable integrar? (pagos, calendario, CRM, email)' },
      { key: 'existingClientBase', label: '¿Tenés ya una base de alumnos/clientes que haya que migrar a la plataforma nueva?' },
    ],
  },
  {
    title: 'Cómo llegaste hasta acá',
    marketing: true,
    fields: [
      { key: 'howFoundUs', label: '¿Cómo nos encontraste / cómo llegaste a Synous AI?' },
      { key: 'decisionTrigger', label: "¿Qué fue lo que te hizo pasar de 'tengo curiosidad' a 'quiero contratar esto'?" },
      { key: 'doubtsBeforeBuying', label: '¿Qué dudas tenías antes de decidirte a avanzar?' },
    ],
  },
]

// ─── Materiales (paso 7): 4 categorías ───────────────────────────────────────

export interface OnboardingMaterialCategoryDef {
  key: OnboardingMaterialCategory
  label: string
}

export const ONBOARDING_MATERIAL_CATEGORIES: OnboardingMaterialCategoryDef[] = [
  { key: 'logoBrand', label: 'Logo y manual de marca (si existe)' },
  { key: 'programContent', label: 'Contenido del programa (módulos, clases, materiales existentes)' },
  { key: 'clientBase', label: 'Base de alumnos/clientes actual, si hay que migrarla' },
  { key: 'toolAccess', label: 'Accesos a herramientas actuales que haya que conectar' },
]
