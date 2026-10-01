import type { HostedReviewEligibility } from './ports/runtime-gateway'

export const AUTH_REQUIRED_MESSAGE =
  'Autenticación requerida: en Docker exportá GH_TOKEN / GITLAB_TOKEN y reiniciá el contenedor; ' +
  'en una instalación nativa corré gh auth login / glab auth login.'

/** Short noun per provider; an unknown provider stays neutral instead of guessing PR vs MR. */
export function reviewKindName(provider: string): string {
  if (provider === 'gitlab') return 'MR'
  if (['github', 'gitea', 'bitbucket', 'azure-devops'].includes(provider)) return 'PR'
  return 'review'
}

const BLOCKED_COPY: Record<string, string> = {
  dirty: 'hay cambios sin commitear',
  detached_head: 'HEAD desacoplado: no hay rama',
  default_branch: 'estás en la rama por defecto',
  no_upstream: 'la rama no está publicada',
  needs_push: 'hay commits sin pushear',
  needs_sync: 'la rama está atrás del remoto',
  auth_required: AUTH_REQUIRED_MESSAGE,
  fork_head_unsupported: 'las ramas de fork no están soportadas',
  unsupported_provider: 'este proveedor no permite crear reviews desde acá',
  existing_review: 'ya existe un review para esta rama',
  base_not_on_remote: 'la rama base no existe en el remoto: publicá el padre primero'
}

/** Unknown reasons from a newer host are shown verbatim rather than hidden. */
export function blockedReasonText(reason: string | null): string | null {
  if (reason === null) return null
  return BLOCKED_COPY[reason] ?? reason
}

export type ReviewPrimaryAction = {
  kind: 'commit' | 'publish' | 'push' | 'sync' | 'authenticate' | 'open' | 'create'
  label: string
  disabled: boolean
  /** Set for `open`: rendered as an <a target=_blank>, not a button. */
  href?: string
}

/** The single next step toward a review, labeled by the host's `nextAction`. */
export function reviewPrimaryAction(
  eligibility: HostedReviewEligibility,
  creating: boolean
): ReviewPrimaryAction {
  const kind = reviewKindName(eligibility.provider)
  switch (eligibility.nextAction) {
    case 'commit':
      return { kind: 'commit', label: 'commit', disabled: false }
    case 'publish':
      return { kind: 'publish', label: 'publicar', disabled: false }
    case 'push':
      return { kind: 'push', label: 'push', disabled: false }
    case 'sync':
      return { kind: 'sync', label: 'sync', disabled: false }
    case 'authenticate':
      return { kind: 'authenticate', label: 'autenticar', disabled: false }
    case 'open_existing_review': {
      const review = eligibility.review
      if (review) {
        const suffix = review.number === undefined ? '' : ` #${review.number}`
        return { kind: 'open', label: `abrir ${kind}${suffix}`, disabled: false, href: review.url }
      }
      break
    }
    case null:
    default:
      break
  }
  return {
    kind: 'create',
    label: creating ? 'creando…' : `crear ${kind}`,
    disabled: creating || !eligibility.canCreate
  }
}
