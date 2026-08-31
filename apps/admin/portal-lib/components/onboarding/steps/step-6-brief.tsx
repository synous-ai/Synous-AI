'use client'

/**
 * Paso 6 — Brief del proyecto: 16 preguntas en 5 bloques. Un bloque por
 * pantalla (no todo junto, para no abrumar) con su propia mini-navegación.
 * React Hook Form + Zod con TODO el formulario montado (un solo `useForm`):
 * los bloques son simples secciones que se muestran/ocultan y se validan de a
 * grupos de campos con `trigger()`, así el estado no se pierde al ir y volver.
 */

import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, ClipboardList, Loader2 } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Label } from '@portal/components/ui/label'
import { Input } from '@portal/components/ui/input'
import { Textarea } from '@portal/components/ui/textarea'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { useSubmitOnboardingBrief } from '@portal/lib/hooks'
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
  onContinue,
  onBack,
}: {
  briefAnswers: OnboardingBriefAnswers | null
  onContinue: () => void
  onBack: () => void
}) {
  const [blockIndex, setBlockIndex] = useState(0)
  const submitBrief = useSubmitOnboardingBrief()

  const defaultValues = useMemo<BriefFormValues>(
    () => (briefAnswers ? { ...EMPTY_DEFAULTS, ...briefAnswers } : EMPTY_DEFAULTS),
    [briefAnswers],
  )

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<BriefFormValues>({
    resolver: zodResolver(OnboardingBriefFormSchema),
    defaultValues,
    mode: 'onBlur',
  })

  const block = ONBOARDING_BRIEF_BLOCKS[blockIndex]!
  const isLastBlock = blockIndex === ONBOARDING_BRIEF_BLOCKS.length - 1
  const selectedChannels = watch('deliveryChannels')

  async function goNextBlock() {
    const fieldNames: (keyof BriefFormValues)[] = [...block.fields.map((f) => f.key)]
    if (block.withChannels) fieldNames.push('deliveryChannels')
    const valid = await trigger(fieldNames)
    if (!valid) return
    if (isLastBlock) {
      await handleSubmit(onSubmit)()
    } else {
      setBlockIndex((i) => i + 1)
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

      {submitBrief.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {submitBrief.error instanceof Error ? submitBrief.error.message : 'No se pudo guardar el brief.'}
        </p>
      )}

      <WizardNav onBack={goPrevBlock}>
        <Button type="button" onClick={goNextBlock} disabled={submitBrief.isPending} className="min-w-32 gap-2 rounded-full">
          {submitBrief.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLastBlock ? 'Guardar y continuar' : 'Siguiente bloque'}
          {!submitBrief.isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </WizardNav>
    </div>
  )
}
