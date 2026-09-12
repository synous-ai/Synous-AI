'use client'

/**
 * Paso 6 — Brief del proyecto: 16 preguntas en 5 bloques. Un bloque por
 * pantalla (no todo junto, para no abrumar) con su propia mini-navegación.
 * React Hook Form + Zod con TODO el formulario montado (un solo `useForm`):
 * los bloques son simples secciones que se muestran/ocultan y se validan de a
 * grupos de campos con `trigger()`, así el estado no se pierde al ir y volver.
 *
 * PERSISTENCIA: ir y volver entre bloques no perdía nada, pero recargar la
 * página SÍ — los 4 primeros bloques vivían solo en memoria de React Hook Form
 * hasta el submit final. Ahora, al avanzar cada bloque se hace PATCH
 * /brief/draft con lo tipeado y el formulario rehidrata desde `briefDraft`
 * (o `briefAnswers` si el brief ya se envió alguna vez). El avance de bloque
 * ESPERA a que el guardado termine: si falla, no se avanza y se muestra el
 * error, así la pantalla nunca dice "listo" sobre algo que no se guardó.
 */

import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, ClipboardList, Loader2 } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { ShinyButton } from '@portal/components/ui/shiny-button'
import { Label } from '@portal/components/ui/label'
import { Input } from '@portal/components/ui/input'
import { Textarea } from '@portal/components/ui/textarea'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { useSubmitOnboardingBrief, useSaveOnboardingBriefDraft } from '@portal/lib/hooks'
import {
  ONBOARDING_DELIVERY_CHANNELS,
  type OnboardingBriefAnswers,
  type OnboardingDeliveryChannel,
} from '@portal/lib/types'
import { ONBOARDING_BRIEF_BLOCKS } from '@portal/lib/onboarding-content'
import { cn } from '@portal/lib/utils'

// ── Zod schema — mismas 16 claves y validaciones que OnboardingBriefSchema en el backend ──

const DELIVERY_CHANNEL_VALUES = ONBOARDING_DELIVERY_CHANNELS.map((c) => c.value) as [
  OnboardingDeliveryChannel,
  ...OnboardingDeliveryChannel[],
]

const OnboardingBriefFormSchema = z.object({
  businessProgram: z.string().min(1, 'Requerido'),
  activeClients: z.string().min(1, 'Requerido'),
  deliveryChannels: z.array(z.enum(DELIVERY_CHANNEL_VALUES)).min(1, 'Elegí al menos un canal'),
  deliveryChannelsOther: z.string().optional(),
  worstChannel: z.string().min(1, 'Requerido'),
  weeklyTimeDrain: z.string().min(1, 'Requerido'),
  sixMonthConcern: z.string().min(1, 'Requerido'),
  idealDayToDay: z.string().min(1, 'Requerido'),
  desiredStudentFeeling: z.string().min(1, 'Requerido'),
  referenceApps: z.string().min(1, 'Requerido'),
  teamRoles: z.string().min(1, 'Requerido'),
  brandIdentity: z.string().min(1, 'Requerido'),
  requiredIntegrations: z.string().min(1, 'Requerido'),
  existingClientBase: z.string().min(1, 'Requerido'),
  howFoundUs: z.string().min(1, 'Requerido'),
  decisionTrigger: z.string().min(1, 'Requerido'),
  doubtsBeforeBuying: z.string().min(1, 'Requerido'),
}).superRefine((value, ctx) => {
  // Mismo refine que OnboardingBriefSchema en el backend: si eligió "otro",
  // tiene que decir cuál (si no, q3 queda sin información útil).
  if (value.deliveryChannels.includes('otro') && !value.deliveryChannelsOther?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryChannelsOther'], message: 'Contanos cuál es el otro canal.' })
  }
})

type BriefFormValues = z.infer<typeof OnboardingBriefFormSchema>

const EMPTY_DEFAULTS: BriefFormValues = {
  businessProgram: '',
  activeClients: '',
  deliveryChannels: [],
  deliveryChannelsOther: '',
  worstChannel: '',
  weeklyTimeDrain: '',
  sixMonthConcern: '',
  idealDayToDay: '',
  desiredStudentFeeling: '',
  referenceApps: '',
  teamRoles: '',
  brandIdentity: '',
  requiredIntegrations: '',
  existingClientBase: '',
  howFoundUs: '',
  decisionTrigger: '',
  doubtsBeforeBuying: '',
}

export function Step6Brief({
  briefAnswers,
  briefDraft,
  onContinue,
  onBack,
}: {
  briefAnswers: OnboardingBriefAnswers | null
  briefDraft: Partial<OnboardingBriefAnswers> | null
  onContinue: () => void
  onBack: () => void
}) {
  const [blockIndex, setBlockIndex] = useState(0)
  const submitBrief = useSubmitOnboardingBrief()
  const saveDraft = useSaveOnboardingBriefDraft()

  // Rehidratación al montar (incluye volver después de un reload o de días):
  // el brief ya enviado como base y el borrador encima, que es lo más reciente.
  const defaultValues = useMemo<BriefFormValues>(
    () => ({ ...EMPTY_DEFAULTS, ...(briefAnswers ?? {}), ...(briefDraft ?? {}) }),
    [briefAnswers, briefDraft],
  )

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    getValues,
    formState: { errors },
  } = useForm<BriefFormValues>({
    resolver: zodResolver(OnboardingBriefFormSchema),
    defaultValues,
    mode: 'onBlur',
  })

  const block = ONBOARDING_BRIEF_BLOCKS[blockIndex]!
  const isLastBlock = blockIndex === ONBOARDING_BRIEF_BLOCKS.length - 1
  const selectedChannels = watch('deliveryChannels')
  // Un solo flag para el botón: el doble click queda bloqueado tanto mientras
  // se guarda el borrador como durante el submit final.
  const busy = submitBrief.isPending || saveDraft.isPending

  async function goNextBlock() {
    const fieldNames: (keyof BriefFormValues)[] = [...block.fields.map((f) => f.key)]
    if (block.withChannels) fieldNames.push('deliveryChannels', 'deliveryChannelsOther')
    const valid = await trigger(fieldNames)
    if (!valid) return
    if (isLastBlock) {
      await handleSubmit(onSubmit)()
      return
    }
    // Persistir lo del bloque ANTES de avanzar. Si el guardado falla no se
    // avanza: el cliente ve el error y puede reintentar sin haber perdido nada.
    const saved = await saveCurrentBlockDraft(fieldNames)
    if (!saved) return
    setBlockIndex((i) => i + 1)
  }

  /** Manda al backend solo los campos del bloque actual (merge parcial en DB). */
  async function saveCurrentBlockDraft(fieldNames: (keyof BriefFormValues)[]): Promise<boolean> {
    const values = getValues()
    const partial: Partial<OnboardingBriefAnswers> = {}
    for (const key of fieldNames) {
      const value = values[key]
      if (key === 'deliveryChannels') {
        partial.deliveryChannels = value as OnboardingDeliveryChannel[]
      } else if (typeof value === 'string' && value.trim().length > 0) {
        // El borrador no acepta strings vacíos: se omiten en vez de guardar ''.
        partial[key as Exclude<keyof OnboardingBriefAnswers, 'deliveryChannels'>] = value
      }
    }
    if (Object.keys(partial).length === 0) return true
    try {
      await saveDraft.mutateAsync(partial)
      return true
    } catch {
      return false
    }
  }

  function goPrevBlock() {
    if (blockIndex === 0) {
      onBack()
    } else {
      setBlockIndex((i) => i - 1)
    }
  }

  async function onSubmit(values: BriefFormValues) {
    const payload: OnboardingBriefAnswers = {
      ...values,
      deliveryChannelsOther: values.deliveryChannelsOther?.trim() || undefined,
    }
    try {
      await submitBrief.mutateAsync(payload)
      onContinue()
    } catch {
      /* el error se muestra abajo vía submitBrief.isError */
    }
  }

  return (
    <div>
      <StepHeader
        icon={ClipboardList}
        eyebrow={`Paso 6 de 8 · Bloque ${blockIndex + 1} de ${ONBOARDING_BRIEF_BLOCKS.length}`}
        title={block.title}
      />

      {/* Mini-progreso de bloques dentro del paso 6 */}
      <div className="mb-6 flex items-center justify-center gap-1.5">
        {ONBOARDING_BRIEF_BLOCKS.map((b, i) => (
          <span
            key={b.title}
            className={cn(
              'h-1 w-7 rounded-full transition-colors',
              i === blockIndex ? 'bg-primary' : i < blockIndex ? 'bg-primary/50' : 'bg-white/10',
            )}
          />
        ))}
      </div>

      <div className="space-y-6">
        {block.fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`brief-${f.key}`}>{f.label}</Label>
            <Textarea id={`brief-${f.key}`} rows={3} {...register(f.key)} />
            {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]?.message as string}</p>}
          </div>
        ))}

        {block.withChannels && (
          <div className="space-y-2">
            <Label>¿Cómo entregás hoy tu programa?</Label>
            <Controller
              control={control}
              name="deliveryChannels"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_DELIVERY_CHANNELS.map((c) => {
                    const active = field.value?.includes(c.value)
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          const next = active
                            ? field.value.filter((v) => v !== c.value)
                            : [...(field.value ?? []), c.value]
                          field.onChange(next)
                        }}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground shadow-card'
                            : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                        )}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              )}
            />
            {errors.deliveryChannels && (
              <p className="text-xs text-destructive">{errors.deliveryChannels.message}</p>
            )}
            {selectedChannels?.includes('otro') && (
              <Input placeholder="¿Cuál?" {...register('deliveryChannelsOther')} className="mt-2" />
            )}
          </div>
        )}
      </div>

      {(submitBrief.isError || saveDraft.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {submitBrief.error instanceof Error
            ? submitBrief.error.message
            : 'No se pudieron guardar tus respuestas. Revisá tu conexión y probá de nuevo.'}
        </p>
      )}

      <WizardNav onBack={goPrevBlock}>
        <ShinyButton onClick={goNextBlock} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLastBlock ? 'Guardar y continuar' : 'Siguiente bloque'}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </ShinyButton>
      </WizardNav>
    </div>
  )
}
