import { createCompiler, type DesignSystem, type Files } from './compiler'

/** Every class used in an HTML document's class attributes. */
export function classesInHtml(html: string): Set<string> {
  const out = new Set<string>()
  for (const m of html.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    for (const c of (m[1] ?? m[2] ?? '').split(/\s+/)) if (c) out.add(c)
  }
  return out
}

/** First rule selector Tailwind prints for a single class, or null if it's not a utility. */
async function selectorFor(files: Files, cls: string): Promise<string | null> {
  // Fresh compiler per class: build() accumulates candidates across calls.
  const css = (await createCompiler(files)).build([cls])
  const rules = css.replace(/^\/\*![^*]*\*\/\s*/, '').replace(/@layer theme\s*\{[\s\S]*?\n\}\n?/, '')
  return rules.match(/^\s*(\.[^\s{,]+)\s*\{/m)?.[1] ?? null
}

/**
 * Classes on the page that Tailwind would generate but the cache doesn't
 * contain, i.e. the scanner never saw them. `memo` is shared across pages.
 */
export async function missingClasses(
  classes: Iterable<string>,
  files: Files,
  ds: DesignSystem,
  cacheCss: string,
  memo: Map<string, string | null> = new Map(),
): Promise<string[]> {
  const missing: string[] = []
  for (const cls of classes) {
    if (ds.parseCandidate(cls).length === 0) continue // not a Tailwind class
    if (!memo.has(cls)) memo.set(cls, await selectorFor(files, cls))
    const selector = memo.get(cls)
    if (selector && !cacheCss.includes(selector)) missing.push(cls)
  }
  return missing
}
