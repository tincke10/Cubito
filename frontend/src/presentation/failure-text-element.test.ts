import { describe, expect, it } from 'vitest'
import { plainFailure } from '../application/i18n/user-facing-error'
import { renderFailureText } from './failure-text-element'

type Node = {
  tag?: string
  className: string
  textContent: string
  children: Node[]
  appendChild(child: Node): Node
}

const node = (tag?: string): Node => {
  const self: Node = {
    ...(tag === undefined ? {} : { tag }),
    className: '',
    textContent: '',
    children: [],
    appendChild(child) {
      self.children.push(child)
      return child
    }
  }
  return self
}
const doc = { createElement: (tag: string) => node(tag) } as unknown as Document

describe('renderFailureText', () => {
  it('writes a lone lead as plain text', () => {
    const el = node()
    renderFailureText(doc, el as unknown as HTMLElement, plainFailure('no se pudo'))
    expect(el.textContent).toBe('no se pudo')
    expect(el.children).toEqual([])
  })

  it('puts the lead in the element and the engine detail in a muted child', () => {
    const el = node()
    renderFailureText(doc, el as unknown as HTMLElement, { lead: 'no se pudo', detail: 'fatal: x' })
    expect(el.textContent).toBe('no se pudo')
    expect(el.children).toHaveLength(1)
    expect(el.children[0]).toMatchObject({
      className: 'cubito-failure__detail',
      textContent: 'fatal: x'
    })
  })

  it('prepends the prefix to the lead and replaces the previous detail', () => {
    const el = node()
    renderFailureText(doc, el as unknown as HTMLElement, { lead: 'a', detail: 'b' }, 'p · ')
    expect(el.textContent).toBe('p · a')
  })
})
