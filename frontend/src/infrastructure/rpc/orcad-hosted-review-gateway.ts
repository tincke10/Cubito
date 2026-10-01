import type {
  HostedReviewCreateResult,
  HostedReviewEligibility,
  HostedReviewLink,
  RuntimeGateway
} from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type HostedReviewMethods = Pick<
  RuntimeGateway,
  'hostedReviewEligibility' | 'hostedReviewCreate'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function toLink(value: unknown): HostedReviewLink | null {
  if (!isRecord(value) || typeof value.url !== 'string') return null
  return {
    ...(typeof value.number === 'number' ? { number: value.number } : {}),
    url: value.url
  }
}

function toEligibility(result: unknown): HostedReviewEligibility {
  if (!isRecord(result) || typeof result.provider !== 'string') {
    throw new Error('hostedReview.getCreationEligibility returned no provider')
  }
  return {
    provider: result.provider,
    review: toLink(result.review),
    canCreate: result.canCreate === true,
    blockedReason: text(result.blockedReason),
    nextAction: text(result.nextAction),
    defaultBaseRef: text(result.defaultBaseRef),
    head: text(result.head),
    title: text(result.title),
    body: text(result.body)
  }
}

function toCreateResult(result: unknown): HostedReviewCreateResult {
  if (isRecord(result) && result.ok === true && typeof result.url === 'string') {
    return {
      ok: true,
      ...(typeof result.number === 'number' ? { number: result.number } : {}),
      url: result.url
    }
  }
  const raw = isRecord(result) ? result : {}
  const existing = toLink(raw.existingReview)
  return {
    ok: false,
    code: text(raw.code) ?? 'unknown',
    error: text(raw.error) ?? 'review creation failed',
    ...(existing ? { existingReview: existing } : {})
  }
}

/** hostedReview.* gateway, its own module because orcad-gateway.ts is at its max-lines budget. */
export function createHostedReviewMethods(connection: { call: RpcCaller }): HostedReviewMethods {
  return {
    async hostedReviewEligibility(input) {
      const response = await connection.call('hostedReview.getCreationEligibility', input)
      return toEligibility(response.result)
    },
    async hostedReviewCreate(input) {
      const response = await connection.call('hostedReview.create', input)
      return toCreateResult(response.result)
    }
  }
}
