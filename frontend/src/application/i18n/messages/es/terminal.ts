import type { enTerminal } from '../en/terminal'

export const esTerminal: Record<keyof typeof enTerminal, string> = {
  'terminal.header': 'terminal {index}/{total} · {title}',
  'terminal.fallbackTitle': 'shell'
}
