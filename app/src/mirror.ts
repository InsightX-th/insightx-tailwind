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
