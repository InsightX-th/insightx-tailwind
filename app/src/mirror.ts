/**
 * Make the block editor canvas use the same CSS as the frontend:
 *  1. copy the frontend <head> styles (theme CSS, fonts, Customizer vars…) in,
 *  2. drop canvas stylesheets the frontend doesn't have and that restyle content:
 *     wp-admin base CSS + its reset, the classic-theme editor layout, and the
 *     theme's own admin CSS,
 *  3. flag <html> so assets/editor-canvas.css hands Common Blocks back to the
 *     frontend cascade (revert-layer) instead of guessing values.
 * The theme's editor-only stylesheet (add_editor_style) is emptied server-side
 * (src/Integration/Gutenberg.php) because the real frontend CSS replaces it.
 */

const REMOVE_CSS = new Set([
  'common-css',
  'forms-css',
  'wp-reset-editor-styles-css',
  'wp-editor-classic-layout-styles-css',
  'classic-theme-styles-css',
])

/** Frontend styles that don't belong in the canvas (our live runtime replaces the cache). */
const SKIP_FRONT = /^(insightx-tailwind-css|admin-bar|dashicons-css|wp-emoji|wp-block-library-css|yoast-seo-adminbar)/

export function shouldRemove(link: HTMLLinkElement, themeUrls: string[]): boolean {
  if (REMOVE_CSS.has(link.id)) return true
  // The theme's admin/editor CSS; its frontend CSS is copied in below.
  return themeUrls.some((url) => url !== '' && link.href.startsWith(url))
}

export async function mirrorFrontend(doc: Document, frontUrl: string, themeUrls: string[]): Promise<void> {
  const html = await fetch(frontUrl, { credentials: 'same-origin' }).then((r) => r.text())
  const front = new DOMParser().parseFromString(html, 'text/html').head

  for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (shouldRemove(link, themeUrls)) link.remove()
  }
  const before = doc.getElementById('insightx-tailwind-runtime')
  for (const node of front.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')) {
    if (SKIP_FRONT.test(node.id)) continue
    const copy = doc.importNode(node, true)
    copy.dataset.ixtFront = '1'
    doc.head.insertBefore(copy, before)
  }
  doc.documentElement.classList.add('ixt-mirror')
}

/**
 * The Widgets editor is not iframed: its blocks share the admin document, whose
 * unlayered CSS (common.css, the editor reset) beats every `@layer` rule no matter
 * the specificity. So frontend CSS is un-layered and scoped to the canvas:
 *  - formerly layered rules (preflight, layered theme CSS) get a (0,1,0) scope,
 *    enough to beat admin element rules but still lose to unlayered frontend rules,
 *  - unlayered rules get a (0,2,0) scope, so they keep their frontend order among
 *    themselves and still win over the formerly layered ones.
 */
const WIDGETS_LAYERED_SCOPE = ':where(.blocks-widgets-container) .editor-styles-wrapper'
const WIDGETS_SCOPE = '.blocks-widgets-container .editor-styles-wrapper'

export function isWidgetsEditor(doc: Document = document): boolean {
  return doc.body?.classList.contains('widgets-php') === true
}

interface RuleLike {
  cssText: string
  cssRules?: ArrayLike<RuleLike>
}

/** Split CSS rules into those inside an `@layer` block and the rest, dropping layer order statements. */
export function splitLayers(rules: ArrayLike<RuleLike>, inLayer = false, out = { layered: [] as string[], plain: [] as string[] }) {
  for (const rule of Array.from(rules)) {
    if (rule.cssText.startsWith('@layer')) {
      if (rule.cssRules) splitLayers(rule.cssRules, true, out)
      continue
    }
    ;(inLayer ? out.layered : out.plain).push(rule.cssText)
  }
  return out
}

type TransformStyles = (styles: { css: string; baseURL?: string }[], scope: string) => (string | null)[]

/** Un-layer and scope CSS to the Widgets editor canvas (see above). */
export function scopeForWidgets(css: string, baseURL?: string): string {
  const transform = (window.wp.blockEditor as { transformStyles?: TransformStyles }).transformStyles
  if (!transform) return css
  // Constructed sheets ignore @import; keep them (e.g. web fonts) at the top.
  const imports = css.match(/@import\s[^;]+;/g) ?? []
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  const { layered, plain } = splitLayers(sheet.cssRules)
  const scoped = [
    transform([{ css: layered.join('\n'), baseURL }], WIDGETS_LAYERED_SCOPE)[0] ?? '',
    transform([{ css: plain.join('\n'), baseURL }], WIDGETS_SCOPE)[0] ?? '',
  ]
  return [...imports, ...scoped].join('\n')
}

export async function mirrorWidgetFrontend(doc: Document, frontUrl: string): Promise<void> {
  const response = await fetch(frontUrl, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Frontend returned ${response.status}`)
  const front = new DOMParser().parseFromString(await response.text(), 'text/html').head
  const before = doc.getElementById('insightx-tailwind-runtime')

  for (const node of front.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')) {
    if (SKIP_FRONT.test(node.id)) continue
    try {
      let css = node.textContent ?? ''
      let baseURL: string | undefined
      if (node.tagName === 'LINK') {
        const url = new URL(node.getAttribute('href') ?? '', frontUrl)
        // ponytail: cross-origin (CDN) sheets are skipped; they can't be fetched and scoped.
        if (url.origin !== location.origin) continue
        const sheet = await fetch(url.href, { credentials: 'same-origin' })
        if (!sheet.ok) continue
        css = await sheet.text()
        baseURL = url.href
        const media = node.getAttribute('media')
        if (media && media !== 'all') css = `@media ${media} {\n${css}\n}`
      }
      if (!css.trim()) continue
      const style = doc.createElement('style')
      style.dataset.ixtFront = 'widgets'
      style.textContent = scopeForWidgets(css, baseURL)
      doc.head.insertBefore(style, before)
    } catch (error) {
      console.warn('[insightx-tailwind] skipped a widget preview stylesheet', error)
    }
  }
}
