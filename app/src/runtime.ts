import { createCompiler, withImportant, withPageFiles, type Compiler, type Files } from './compiler'
import { getConfig } from './config'
import { isWidgetsEditor, mirrorFrontend, mirrorWidgetFrontend, scopeForWidgets } from './mirror'

/**
 * Live compiler: watches every class in `doc` and keeps a <style> with the
 * generated CSS at the very end of <head>. Used in the Gutenberg canvas
 * iframe, the Elementor preview, and the frontend when no cache exists.
 */
export async function startRuntime(
  doc: Document = document,
  files: Files = getConfig().files,
  transform: (css: string) => string = (css) => css,
): Promise<() => void> {
  let compiler: Compiler
  try {
    compiler = await createCompiler(files)
  } catch (error) {
    console.error('[insightx-tailwind]', error)
    return () => {}
  }

  const style = doc.createElement('style')
  style.id = 'insightx-tailwind-runtime'
  const seen = new Set<string>()
  let pending: Element[] = [doc.documentElement]
  let scheduled = false

  const flush = () => {
    scheduled = false
    let changed = false
    for (const root of pending) {
      const nodes = [root, ...root.querySelectorAll('[class]')]
      for (const el of nodes) {
        for (const c of el.classList) {
          if (!seen.has(c)) {
            seen.add(c)
            changed = true
          }
        }
      }
    }
    pending = []
    if (changed) style.textContent = transform(compiler.build([...seen]))
    // Stay last so we win over anything injected after us.
    if (doc.head.lastElementChild !== style) doc.head.append(style)
  }

  const schedule = (el: Element) => {
    pending.push(el)
    if (!scheduled) {
      scheduled = true
      requestAnimationFrame(flush)
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof Element) schedule(m.target)
      for (const n of m.addedNodes) if (n instanceof Element) schedule(n)
    }
  })
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  flush()

  return () => {
    observer.disconnect()
    style.remove()
  }
}

/** Block editor canvas iframe (theme editor styles there get extra specificity). */
function inBlockEditorCanvas(): boolean {
  return window.frameElement?.getAttribute('name') === 'editor-canvas' || document.body?.classList.contains('block-editor-iframe__body') === true
}

// Entry point: PHP enqueues runtime.js only where live compiling is wanted.
// Don't import this module from other entries — it starts on load.
const start = () => {
  const config = getConfig()
  if (isWidgetsEditor()) {
    // Widgets editor: blocks live in the admin document, so scope everything to its canvas.
    void startRuntime(document, config.files, (css) => scopeForWidgets(css))
    if (config.mirrorFrontend && config.frontUrl) {
      mirrorWidgetFrontend(document, config.frontUrl).catch((error: unknown) =>
        console.error('[insightx-tailwind] could not load widget preview styles', error),
      )
    }
    return
  }
  if (!inBlockEditorCanvas()) {
    void startRuntime(document, config.files)
    return
  }
  void startRuntime(document, withImportant(withPageFiles(config.files, config.pageFiles ?? [])))
  if (config.mirrorFrontend && config.frontUrl) {
    mirrorFrontend(document, config.frontUrl, config.themeUrls ?? []).catch((error: unknown) =>
      console.error('[insightx-tailwind] could not load frontend styles', error),
    )
  }
}
if (document.body) start()
else document.addEventListener('DOMContentLoaded', start, { once: true })
