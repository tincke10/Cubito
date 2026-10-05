import type { MessageKey } from './messages/en'
import { t } from './translate'

/** Localized "what failed" plus the engine's own message, never translated (searchable). */
export type UserFacingError = { lead: string; detail: string | null }

export type FailureAction = MessageKey extends infer K
  ? K extends `failure.action.${infer A}`
    ? A
    : never
  : never

// Why: auth_required already has long-form guidance under the review copy.
const CODE_LEADS: Readonly<Record<string, MessageKey>> = {
  auth_required: 'review.authRequired',
  already_exists: 'failure.code.already_exists',
  validation: 'failure.code.validation',
  timeout: 'failure.code.timeout',
  unknown_completion: 'failure.code.unknown_completion',
  push_failed: 'failure.code.push_failed',
  unsupported_provider: 'failure.code.unsupported_provider',
  binary_file: 'failure.code.binary_file'
}

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? typeof error.code === 'string'
      ? error.code
      : undefined
    : undefined

const messageOf = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'string' || typeof error === 'number'
      ? String(error)
      : ''

/** Lead from the engine code when it has copy, else from the failed action; detail stays raw. */
export function describeFailure(
  action: FailureAction,
  error: unknown,
  code?: string
): UserFacingError {
  const codeKey = CODE_LEADS[code ?? codeOf(error) ?? '']
  const lead = t(codeKey ?? `failure.action.${action}`)
  const detail = messageOf(error).trim()
  return { lead, detail: detail === '' || detail === lead ? null : detail }
}

// Why: lets existing `string` view-model fields carry both lines; git stderr may hold any newline.
const SEPARATOR = '\u001f'

export const joinFailure = ({ lead, detail }: UserFacingError): string =>
  detail === null ? lead : `${lead}${SEPARATOR}${detail}`

export function splitFailureText(text: string): UserFacingError {
  const at = text.indexOf(SEPARATOR)
  return at === -1
    ? { lead: text, detail: null }
    : { lead: text.slice(0, at), detail: text.slice(at + 1) }
}

export const failureText = (action: FailureAction, error: unknown, code?: string): string =>
  joinFailure(describeFailure(action, error, code))
