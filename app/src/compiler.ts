import { compile, __unstable__loadDesignSystem } from 'tailwindcss'
import indexCss from 'tailwindcss/index.css?raw'
import themeCss from 'tailwindcss/theme.css?raw'
import preflightCss from 'tailwindcss/preflight.css?raw'
import utilitiesCss from 'tailwindcss/utilities.css?raw'

/** User CSS files, keyed by flat file name. `main.css` is the entry. */
export type Files = Record<string, string>

export const ENTRY = 'main.css'

const HEADER = (preflight: boolean) => `@layer theme, base, components;

@import "tailwindcss/theme.css" layer(theme);
${preflight ? '@import "tailwindcss/preflight.css" layer(base);' : `/* Preflight is off so the theme's own reset stays intact. Uncomment to enable:
@import "tailwindcss/preflight.css" layer(base); */`}

/* Unlayered => beats the theme's CSS. Add \`important\` if a theme selector
   is more specific:  @import "tailwindcss/utilities.css" important; */
@import "tailwindcss/utilities.css";
`

/**
 * Default main.css. Utilities are imported WITHOUT a cascade layer: layered
 * rules always lose to the theme's unlayered CSS, unlayered ones compete on
 * specificity + order, and we print last in <head>.
 */
export const DEFAULT_MAIN_CSS = HEADER(false)

const tailwindSheets: Record<string, string> = {
  tailwindcss: indexCss,
  'tailwindcss/index.css': indexCss,
  'tailwindcss/theme': themeCss,
  'tailwindcss/theme.css': themeCss,
  'tailwindcss/preflight': preflightCss,
  'tailwindcss/preflight.css': preflightCss,
  'tailwindcss/utilities': utilitiesCss,
  'tailwindcss/utilities.css': utilitiesCss,
}

export function entryOf(files: Files): string {
  const main = files[ENTRY]
  return main === undefined || main.trim() === '' ? DEFAULT_MAIN_CSS : main
}

function optionsFor(files: Files) {
  return {
    base: '/',
    async loadStylesheet(id: string, base: string) {
      const builtin = tailwindSheets[id]
      if (builtin !== undefined) return { path: id, base, content: builtin }
      const name = id.replace(/^\.\//, '')
      const content = files[name]
      if (content === undefined) {
        throw new Error(`insightx-tailwind: cannot @import "${id}" (file not found)`)
      }
      return { path: name, base, content }
    },
    async loadModule(id: string): Promise<never> {
      throw new Error(`insightx-tailwind: @plugin/@config "${id}" is not supported yet`)
    },
  }
}

/** Files main.css imports with `@import "./x.css"`: these apply on every page. */
export function importedFiles(files: Files): Set<string> {
  const out = new Set<string>()
  for (const m of entryOf(files).matchAll(/@import\s+(?:url\()?\s*["']\.?\/?([a-z0-9][a-z0-9._-]*\.css)["']/gi)) {
    if (m[1]) out.add(m[1])
  }
  return out
}

/** Entry for one page: main.css plus that page's own files (not already global). */
export function withPageFiles(files: Files, pageFiles: string[]): Files {
  const global = importedFiles(files)
  const extra = pageFiles.filter((name) => name in files && !global.has(name) && name !== ENTRY)
  if (extra.length === 0) return files
  const imports = extra.map((name) => `@import "./${name}";`).join('\n')
  return { ...files, [ENTRY]: `${entryOf(files)}\n\n/* Page CSS */\n${imports}\n` }
}

export type Compiler = Awaited<ReturnType<typeof compile>>
export type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>

// The URL is matched as a whole quoted string: Google Fonts URLs contain ';' (wght@0,100;0,200).
const REMOTE_IMPORT =
  /^[ \t]*@import\s+(?:url\(\s*(["'])(?:https?:)?\/\/.*?\1\s*\)|url\(\s*(?:https?:)?\/\/[^)'"]*\)|(["'])(?:https?:)?\/\/.*?\2)[^;]*;[ \t]*\n?/gim

/**
 * Remote `@import url(...)` (e.g. Google Fonts) written in an imported file ends up
 * in the middle of Tailwind's output, where browsers ignore it: @import only works
 * before every other rule. Move them all to the top (deduplicated).
 */
export function hoistImports(css: string): string {
  const imports = new Set<string>()
  const body = css.replace(REMOTE_IMPORT, (m: string) => {
    imports.add(m.trim())
    return ''
  })
  if (imports.size === 0) return css
  const head = [...imports].join('\n') + '\n'
  // Keep Tailwind's license comment first; comments may precede @import.
  const banner = body.match(/^\/\*![^*]*\*\/\s*\n?/)
  return banner ? banner[0] + head + body.slice(banner[0].length) : head + body
}

export async function createCompiler(files: Files): Promise<Compiler> {
  const compiler = await compile(entryOf(files), optionsFor(files))
  return { ...compiler, build: (candidates: string[]) => hoistImports(compiler.build(candidates)) }
}

export function loadDesignSystem(files: Files): Promise<DesignSystem> {
  return __unstable__loadDesignSystem(entryOf(files), optionsFor(files))
}

/**
 * Split arbitrary content (HTML, PHP, JSON, …) into candidate tokens.
 * Tailwind silently ignores tokens that aren't valid utilities, so being
 * generous here is fine.
 * ponytail: regex tokenizer, misses classes built by string concatenation;
 * port Tailwind's oxide extractor if that matters.
 */
export function extractCandidates(content: string, into: Set<string> = new Set()): Set<string> {
  // Block comment JSON escapes markup (\u0022 for ", \u0026 for &) and newlines.
  const decoded = content
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[nrt]/g, ' ')
  // `=` stays inside tokens: data-[open=false]:hidden.
  for (const token of decoded.split(/[\s"'`<>\\{}]+/)) {
    const t = token.replace(/[,;]+$/, '')
    if (t.length > 0 && t.length < 200) into.add(t)
  }
  return into
}

/**
 * WindPress main.css uses `@import "tailwindcss"`, which puts utilities in a
 * layer (they lose to the theme). Swap it for our unlayered header, keeping
 * preflight on because WindPress had it on and the site was designed with it.
 */
export function migrateWindpressMain(css: string): string {
  const re = /@import\s+(["'])tailwindcss\1[^;]*;\s*/
  return re.test(css) ? css.replace(re, HEADER(true) + '\n') : HEADER(true) + '\n' + css
}

/**
 * Same files, but utilities marked !important. Used inside the block editor
 * canvas, where WordPress prefixes theme editor styles with
 * `.editor-styles-wrapper` (e.g. `.editor-styles-wrapper a` beats `.text-white`),
 * which doesn't happen on the frontend.
 */
export function withImportant(files: Files): Files {
  const re = /@import\s+(["'])tailwindcss(?:\/utilities(?:\.css)?)?\1([^;]*);/g
  const entry = entryOf(files).replace(re, (match: string, _q: string, rest: string) =>
    /\bimportant\b/.test(rest) ? match : match.replace(/;$/, ' important;'),
  )
  return { ...files, [ENTRY]: entry }
}

export type ThemeJsonMode = 'off' | 'custom' | 'all'

export interface ThemeJsonPreset {
  palette: { name: string; slug: string; color: string }[]
  fontFamilies: { name: string; slug: string; fontFamily: string }[]
}

const DEFAULT_FLAG = 4 // ThemeOptions.DEFAULT (const enum, not importable at runtime)

/** Colors + font families from @theme, for Gutenberg's palette (theme.json). */
export function themeJsonPreset(ds: DesignSystem, mode: ThemeJsonMode): ThemeJsonPreset {
  const preset: ThemeJsonPreset = { palette: [], fontFamilies: [] }
  if (mode === 'off') return preset

  const pick = (ns: '--color' | '--font') => {
    const out: [string, string][] = []
    for (const [name, value] of ds.theme.namespace(ns)) {
      // Skip the namespace default and nested keys like `sans--font-feature-settings`.
      if (name === null || name.includes('--')) continue
      if (mode === 'custom' && (ds.theme.getOptions(`${ns}-${name}`) & DEFAULT_FLAG) !== 0) continue
      out.push([name, value])
    }
    return out
  }

  for (const [slug, color] of pick('--color')) {
    preset.palette.push({ name: `[tw] ${slug.replace(/-/g, ' ')}`, slug: `tw-${slug}`, color })
  }
  for (const [slug, fontFamily] of pick('--font')) {
    preset.fontFamilies.push({ name: `[tw] ${slug}`, slug: `tw-${slug}`, fontFamily })
  }
  return preset
}
