import type { PluginCreator } from 'tailwindcss/plugin'
import { getDynamicCSSRules } from '@iconify/tailwind4/lib/plugins/dynamic.js'

/** Opt in from main.css with `@plugin "@iconify/tailwind4";` */
export const ICONS_PLUGIN = '@iconify/tailwind4'

/**
 * Browser build of @iconify/tailwind4's dynamic plugin: `icon-[lucide--house]`.
 * The real entry reads icon sets from disk (node:fs, @iconify/tools), so we call its
 * rule generator directly with the icon data bundled as a lazy chunk.
 * ponytail: only the sets sites use, all loaded together; no plugin options (prefix/scale).
 * Add a set = `pnpm add -D @iconify-json/<prefix>` + one line in loadIconPlugin().
 */
export async function loadIconPlugin(): Promise<PluginCreator> {
  const [lucide, streamlineLogos, pixel] = await Promise.all([
    import('@iconify-json/lucide/icons.json'),
    import('@iconify-json/streamline-logos/icons.json'),
    import('@iconify-json/pixel/icons.json'),
  ])
  const iconSets = { lucide: lucide.default, 'streamline-logos': streamlineLogos.default, pixel: pixel.default }
  return ({ matchComponents }) => {
    matchComponents({
      icon: (name) => {
        try {
          return getDynamicCSSRules(name, { iconSets })
        } catch {
          return {} // unknown set or icon name: no CSS
        }
      },
    })
  }
}
