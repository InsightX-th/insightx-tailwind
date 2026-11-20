import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAIN_CSS,
  createCompiler,
  extractCandidates,
  loadDesignSystem,
  migrateWindpressMain,
  themeJsonPreset,
  withImportant,
  importedFiles,
  withPageFiles,
  hoistImports,
} from './compiler'

describe('extractCandidates', () => {
  it('pulls classes out of HTML and JSON', () => {
    const set = extractCandidates('<div class="p-4 md:flex text-red-500">x</div> {"_css_classes":"bg-[#fff]"}')
    expect(set).toContain('p-4')
    expect(set).toContain('md:flex')
    expect(set).toContain('text-red-500')
    expect(set).toContain('bg-[#fff]')
  })

  it('decodes block-comment JSON escapes and keeps = inside arbitrary variants', () => {
    const set = extractCandidates(
      '<!-- wp:html {"content":"\\u003cspan class=\\u0022ml-1 [.scrolled\\u0026]:shadow-sm\\u0022\\u003e\\nfoo"} --> <div class="data-[open=false]:hidden">',
    )
    expect(set).toContain('ml-1')
    expect(set).toContain('[.scrolled&]:shadow-sm')
    expect(set).toContain('data-[open=false]:hidden')
    expect(set).toContain('foo')
  })
})

describe('compiler', () => {
  it('emits utilities outside any cascade layer by default', async () => {
    const css = (await createCompiler({})).build(['text-red-500', 'not-a-class'])
    expect(css).toContain('.text-red-500')
    expect(css).not.toMatch(/@layer utilities\s*\{/)
    expect(css).not.toContain('not-a-class')
  })

  it('keeps utilities unlayered for an existing plain tailwindcss import', async () => {
    const css = (await createCompiler({ 'main.css': '@import "tailwindcss";\n@theme { --color-brand: #123456; }' })).build(['bg-brand'])
    expect(css).toContain('.bg-brand')
    expect(css).not.toMatch(/@layer utilities\s*\{/)
    expect(css).toContain('box-sizing: border-box')
  })

  it('supports the important flag', async () => {
    const css = (
      await createCompiler({ 'main.css': '@import "tailwindcss/theme.css";\n@import "tailwindcss/utilities.css" important;' })
    ).build(['p-4'])
    expect(css).toMatch(/padding:[^;]*!important/)
  })

  it('resolves relative imports from the file set', async () => {
    const files = {
      'main.css': DEFAULT_MAIN_CSS + '\n@import "./brand.css";',
      'brand.css': '@theme { --color-home-primary: #2563eb; }',
    }
    const css = (await createCompiler(files)).build(['text-home-primary'])
    expect(css).toContain('.text-home-primary')
  })

  it('rejects unknown imports', async () => {
    await expect(createCompiler({ 'main.css': '@import "./missing.css";' })).rejects.toThrow(/file not found/)
  })
})

describe('icons', () => {
  const files = { 'main.css': DEFAULT_MAIN_CSS + '\n@plugin "@iconify/tailwind4";' }

  it('builds icon-[lucide--name] when main.css opts in', async () => {
    const css = (await createCompiler(files)).build(['icon-[lucide--house]', 'hover:icon-[lucide--x]', 'icon-[lucide--not-real]', 'icon-[nope--x]'])
    expect(css).toContain('.icon-\\[lucide--house\\]')
    expect(css).toContain('.hover\\:icon-\\[lucide--x\\]')
    expect(css).toContain('mask-image: var(--svg)')
    expect(css).toContain('background-color: currentColor')
    expect(css).toContain('url("data:image/svg+xml,')
    expect(css).not.toContain('not-real')
    expect(css).not.toContain('nope')
  })

  it('builds the other bundled sets (streamline-logos, pixel)', async () => {
    const css = (await createCompiler(files)).build(['icon-[streamline-logos--line-app-logo-solid]', 'icon-[pixel--facebook-round]'])
    expect(css).toContain('.icon-\\[streamline-logos--line-app-logo-solid\\]')
    expect(css).toContain('.icon-\\[pixel--facebook-round\\]')
  })

  it('stays off without the @plugin line and still rejects other plugins', async () => {
    expect((await createCompiler({})).build(['icon-[lucide--house]'])).not.toContain('lucide')
    await expect(createCompiler({ 'main.css': '@plugin "daisyui";' })).rejects.toThrow(/not supported/)
  })
})

describe('page files', () => {
  const files = {
    'main.css': DEFAULT_MAIN_CSS + '\n@import "./global.css";',
    'global.css': '@theme { --color-brand: #111; }',
    'riku.css': '@theme { --color-riku: #222; }',
    'home.css': '@theme { --color-home: #333; }',
  }

  it('knows which files main.css imports', () => {
    expect([...importedFiles(files)]).toEqual(['global.css'])
  })

  it('adds only that page\'s files to the entry', async () => {
    const page = withPageFiles(files, ['riku.css', 'global.css', 'missing.css'])
    expect(page['main.css']).toContain('@import "./riku.css";')
    expect(page['main.css']).not.toContain('@import "./home.css";')
    expect(page['main.css']?.match(/global\.css/g)?.length).toBe(1)
    const css = (await createCompiler(page)).build(['bg-riku', 'bg-home', 'bg-brand'])
    expect(css).toContain('.bg-riku')
    expect(css).toContain('.bg-brand')
    expect(css).not.toContain('.bg-home')
    expect(withPageFiles(files, [])).toBe(files)
  })
})

describe('hoistImports', () => {
  it('moves remote @import from imported files above every rule', async () => {
    const files = {
      'main.css': '@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css";\n@import "./home.css";',
      'home.css': '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Thai&display=swap");\n@theme { --font-noto: "Noto Sans Thai"; }\n.a { color: red }',
      'riku.css': "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed&display=swap');\n@import url(\"https://fonts.googleapis.com/css2?family=Noto+Sans+Thai&display=swap\");",
    }
    const css = (await createCompiler(withPageFiles(files, ['riku.css']))).build(['font-noto'])
    const firstRule = css.search(/[{]/)
    const imports = [...css.matchAll(/@import url/g)].map((m) => m.index ?? 0)
    expect(imports).toHaveLength(2) // Noto deduplicated
    expect(imports.every((i) => i < firstRule)).toBe(true)
    expect(css.startsWith('/*! tailwindcss')).toBe(true)
  })

  it('keeps URLs that contain semicolons intact', () => {
    const url = "@import url('https://fonts.googleapis.com/css2?family=Kanit:ital,wght@0,100;0,200;1,900&display=swap');"
    const out = hoistImports(`.a{color:red}\n${url}\n.b{color:blue}\n@import "https://x.test/a.css" screen;\n@import url(https://x.test/b.css);`)
    expect(out.startsWith(url)).toBe(true)
    expect(out).toContain('@import "https://x.test/a.css" screen;')
    expect(out).toContain('@import url(https://x.test/b.css);')
    expect(out).not.toMatch(/0,200;1,900&display=swap'\);\n\.b/)
    expect(out.indexOf('.a{color:red}')).toBeGreaterThan(out.lastIndexOf('@import'))
  })

  it('leaves CSS without remote imports untouched', () => {
    expect(hoistImports('.a{color:red}')).toBe('.a{color:red}')
  })
})

describe('withImportant', () => {
  it('marks utilities important without touching theme/preflight imports', async () => {
    const files = withImportant({ 'main.css': migrateWindpressMain('@import "tailwindcss";') })
    expect(files['main.css']).toContain('@import "tailwindcss/utilities.css" important;')
    expect(files['main.css']).toContain('@import "tailwindcss/theme.css" layer(theme);')
    const css = (await createCompiler(files)).build(['text-white'])
    expect(css).toMatch(/color:[^;]*!important/)
    // Idempotent, and works with the plain `@import "tailwindcss"` form.
    expect(withImportant(files)['main.css']).toBe(files['main.css'])
    expect(withImportant({ 'main.css': '@import "tailwindcss";' })['main.css']).toContain('@import "tailwindcss/utilities.css" important;')
  })
})

describe('migrateWindpressMain', () => {
  it('replaces the layered tailwindcss import and keeps the rest', async () => {
    const out = migrateWindpressMain('@import "tailwindcss";\n\n@import "./home.css";')
    expect(out).not.toMatch(/@import\s+"tailwindcss";/)
    expect(out).toContain('@import "tailwindcss/preflight.css" layer(base);')
    expect(out).toContain('@import "./home.css";')
    const css = (await createCompiler({ 'main.css': out, 'home.css': '@theme { --color-home-x: red; }' })).build(['bg-home-x'])
    expect(css).toContain('.bg-home-x')
    expect(css).not.toMatch(/@layer utilities\s*\{/)
  })
})

describe('themeJsonPreset', () => {
  it('returns only custom colors in custom mode', async () => {
    const ds = await loadDesignSystem({ 'main.css': DEFAULT_MAIN_CSS + '\n@theme { --color-brand: #123456; --font-thai: "Noto Sans Thai"; }' })
    const custom = themeJsonPreset(ds, 'custom')
    expect(custom.palette).toEqual([{ name: '[tw] brand', slug: 'tw-brand', color: '#123456' }])
    expect(custom.fontFamilies.map((f) => f.slug)).toEqual(['tw-thai'])
    expect(themeJsonPreset(ds, 'all').palette.length).toBeGreaterThan(200)
    expect(themeJsonPreset(ds, 'off').palette).toEqual([])
  })
})
