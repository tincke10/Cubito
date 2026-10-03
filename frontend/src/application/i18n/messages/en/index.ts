import { enPalette } from './palette'

/** English is the source of truth for message keys; es must mirror it (see es/index.ts). */
export const en = { ...enPalette } as const

export type MessageKey = keyof typeof en
