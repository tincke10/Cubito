import ts from 'typescript-compiler-api'
import { describe, expect, it } from 'vitest'
import { collectGlobalPrefix } from './nest-global-prefix'

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

describe('collectGlobalPrefix', () => {
  it('finds the first setGlobalPrefix string-literal arg and normalizes it', () => {
    const sourceFile = parse(
      [
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule)',
        "  app.setGlobalPrefix('api')",
        '  await app.listen(3000)',
        '}'
      ].join('\n')
    )
    expect(collectGlobalPrefix(sourceFile)).toBe('/api')
  })

  it('ignores the second exclude argument', () => {
    const sourceFile = parse(
      [
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule)',
        "  app.setGlobalPrefix('api', { exclude: ['health'] })",
        '}'
      ].join('\n')
    )
    expect(collectGlobalPrefix(sourceFile)).toBe('/api')
  })

  it('degrades a non-literal prefix arg to the dynamic-path marker', () => {
    const sourceFile = parse(
      [
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule)',
        '  app.setGlobalPrefix(computePrefix())',
        '}'
      ].join('\n')
    )
    expect(collectGlobalPrefix(sourceFile)).toBe('<dynamic>')
  })

  it('returns undefined when there is no setGlobalPrefix call', () => {
    const sourceFile = parse(
      [
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule)',
        '  await app.listen(3000)',
        '}'
      ].join('\n')
    )
    expect(collectGlobalPrefix(sourceFile)).toBeUndefined()
  })
})
