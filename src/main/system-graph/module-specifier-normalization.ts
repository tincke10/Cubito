const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const

/** NodeNext-style imports name the emitted extension; the source on disk is the TS twin. */
const JS_TO_TS_SOURCES: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts']
}

/** Drops one trailing module extension; 'book.service' keeps its dot. */
export function stripModuleExtension(spec: string): string {
  const ext = MODULE_EXTENSIONS.find((candidate) => spec.endsWith(candidate))
  return ext ? spec.slice(0, -ext.length) : spec
}

/** Ordered file paths a normalized import path may point at: exact, TS source twin, appended extension, dir index. */
export function moduleFileCandidates(joinedPath: string): string[] {
  const base = joinedPath.replace(/\/+$/, '')
  const candidates = [base]
  const ext = MODULE_EXTENSIONS.find((candidate) => base.endsWith(candidate))
  if (ext && JS_TO_TS_SOURCES[ext]) {
    const stem = base.slice(0, -ext.length)
    candidates.push(...JS_TO_TS_SOURCES[ext].map((sourceExt) => stem + sourceExt))
  }
  candidates.push(...MODULE_EXTENSIONS.map((moduleExt) => base + moduleExt))
  candidates.push(...MODULE_EXTENSIONS.map((moduleExt) => `${base}/index${moduleExt}`))
  return [...new Set(candidates)]
}
