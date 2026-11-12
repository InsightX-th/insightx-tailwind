import { createCompiler, extractCandidates, loadDesignSystem, themeJsonPreset, withPageFiles } from './compiler'
import { __, api, getConfig, type CacheInfo } from './config'

interface ScanPage {
  contents: string[]
  has_more: boolean
}

/**
 * Full build: pull content from every enabled scan source page by page,
 * compile in the browser, then upload CSS + theme.json preset to the server.
 */
export async function buildCache(log: (line: string) => void = () => {}): Promise<CacheInfo> {
  const config = getConfig()
  const [compiler, ds] = await Promise.all([createCompiler(config.files), loadDesignSystem(config.files)])
  const candidates = new Set<string>()

  for (const source of config.enabledSources ?? []) {
    let page = 1
    let has_more = true
    while (has_more) {
      const res = await api<ScanPage>(`scan?source=${encodeURIComponent(source)}&page=${page}`)
      for (const content of res.contents) extractCandidates(content, candidates)
      log(__('%s: page %s (%s items)', source, page, res.contents.length))
      has_more = res.has_more
      page++
    }
  }

  const css = compiler.build([...candidates])
  const theme = themeJsonPreset(ds, config.themeJson ?? 'custom')
  log(__('Compiled %s tokens → %s KB', candidates.size, (css.length / 1024).toFixed(1)))
  const info = await api<CacheInfo>('cache', { method: 'POST', body: JSON.stringify({ css, theme }) })

  // Pages with their own CSS files get main.css + those files. Same candidates as the
  // global build, so header/footer/widget classes are covered on those pages too.
  // ponytail: one full compile per page; share the candidate set but not the compiler.
  const pages = await api<Record<string, { title: string; files: string[] }>>('page-css')
  for (const [postId, page] of Object.entries(pages)) {
    const pageCss = (await createCompiler(withPageFiles(config.files, page.files))).build([...candidates])
    await api('page-cache', { method: 'POST', body: JSON.stringify({ post_id: Number(postId), css: pageCss }) })
    log(__('Page CSS: %s (%s) → %s KB', page.title, page.files.join(', '), (pageCss.length / 1024).toFixed(1)))
  }
  return info
}
