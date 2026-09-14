import { describe, expect, it } from 'vitest'
import { collectRuntimeClosure } from './cubito-runtime-closure.mjs'

type FakePackage = {
  dir: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function resolverFrom(graph: Record<string, FakePackage>) {
  return (name: string) => {
    const entry = graph[name]
    if (!entry) {
      throw new Error(`Cannot find module '${name}'`)
    }
    return {
      dir: entry.dir,
      packageJson: {
        dependencies: entry.dependencies ?? {},
        optionalDependencies: entry.optionalDependencies ?? {}
      }
    }
  }
}

describe('collectRuntimeClosure', () => {
  it('walks transitive dependencies (is-glob -> is-extglob) into the closure', () => {
    const resolver = resolverFrom({
      '@parcel/watcher': { dir: '/store/watcher', dependencies: { 'is-glob': '^4' } },
      'is-glob': { dir: '/store/is-glob', dependencies: { 'is-extglob': '^2' } },
      'is-extglob': { dir: '/store/is-extglob' }
    })

    const result = collectRuntimeClosure(['@parcel/watcher'], resolver)

    expect([...result.packages.keys()].sort()).toEqual(['@parcel/watcher', 'is-extglob', 'is-glob'])
    expect(result.packages.get('is-extglob')).toBe('/store/is-extglob')
    expect(result.conflicts).toEqual([])
  })

  it('skips a missing optional dependency and reports it, without failing the walk', () => {
    const resolver = resolverFrom({
      'node-pty': { dir: '/store/node-pty', optionalDependencies: { 'missing-opt': '^1' } }
    })

    const result = collectRuntimeClosure(['node-pty'], resolver)

    expect(result.packages.has('missing-opt')).toBe(false)
    expect(result.skippedOptional).toEqual(['missing-opt'])
    expect(result.conflicts).toEqual([])
  })

  it('dedupes a diamond dependency reached through two roots', () => {
    const resolver = resolverFrom({
      'root-a': { dir: '/a', dependencies: { shared: '^1' } },
      'root-b': { dir: '/b', dependencies: { shared: '^1' } },
      shared: { dir: '/store/shared' }
    })

    const result = collectRuntimeClosure(['root-a', 'root-b'], resolver)

    expect(result.packages.size).toBe(3)
    expect(result.packages.get('shared')).toBe('/store/shared')
    expect(result.conflicts).toEqual([])
  })

  it('reports a conflict when the same package name resolves to two different real dirs', () => {
    const resolver = (name: string, fromDir: string | null) => {
      if (name === 'root-a') {
        return { dir: '/a', packageJson: { dependencies: { shared: '^1' } } }
      }
      if (name === 'root-b') {
        return { dir: '/b', packageJson: { dependencies: { shared: '^1' } } }
      }
      if (name === 'shared') {
        const dir = fromDir === '/a' ? '/store/shared-1' : '/store/shared-2'
        return { dir, packageJson: {} }
      }
      throw new Error(`Cannot find module '${name}'`)
    }

    const result = collectRuntimeClosure(['root-a', 'root-b'], resolver)

    expect(result.conflicts).toEqual([
      { name: 'shared', dirs: ['/store/shared-1', '/store/shared-2'] }
    ])
  })

  it('terminates on a dependency cycle instead of looping forever', () => {
    const resolver = resolverFrom({
      a: { dir: '/a', dependencies: { b: '^1' } },
      b: { dir: '/b', dependencies: { a: '^1' } }
    })

    const result = collectRuntimeClosure(['a'], resolver)

    expect(result.packages.get('a')).toBe('/a')
    expect(result.packages.get('b')).toBe('/b')
    expect(result.conflicts).toEqual([])
  })
})
