// Onboarding POST-VENTA (wizard de 8 pasos que el cliente completa en el
// Client Portal). Ver apps/api/src/modules/onboarding/{onboarding.service,onboarding.schema}.ts
// — contrato verificado contra el código real del backend.
//
// Reemplaza al viejo `OnboardingSubmission` (wizard público pre-venta, cuyo
// router/endpoint /api/onboarding/submissions fue eliminado del backend).
//
// Fuente de verdad ÚNICA: portal-lib/lib/types.ts (los mismos tipos que usa
// el wizard del cliente). Antes estaban duplicados byte-a-byte acá — este
// archivo ahora re-exporta desde ahí y solo agrega los tipos específicos de
// las vistas ADMIN (listado/detalle), que también viven en portal-lib/lib/types.ts
// junto al resto para no partir la fuente de verdad en dos archivos.

export type {
  OnboardingStatus,
  OnboardingStepKey,
  OnboardingDeliveryChannel,
  OnboardingBriefAnswers,
  OnboardingMaterialCategory,
  OnboardingMaterialItem,
  OnboardingMaterialsState,
  OnboardingAsset,
  ClientOnboarding,
  AdminOnboardingListItemDTO,
  AdminOnboardingDetailDTO,
} from '@portal/lib/types'

export { ONBOARDING_DELIVERY_CHANNELS } from '@portal/lib/types'
