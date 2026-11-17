import type { PluginCreator } from 'tailwindcss/plugin'
import { getDynamicCSSRules } from '@iconify/tailwind4/lib/plugins/dynamic.js'

/** Opt in from main.css with `@plugin "@iconify/tailwind4";` */
export const ICONS_PLUGIN = '@iconify/tailwind4'

/**
 * Browser build of @iconify/tailwind4's dynamic plugin: `icon-[lucide--house]`.
 * The real entry reads icon sets from disk (node:fs, @iconify/tools), so we call its
 * rule generator directly with the icon data bundled as a lazy chunk.
 * ponytail: Lucide only, no plugin options (prefix/scale); add a set = one more import below.
 */
export async function loadIconPlugin(): Promise<PluginCreator> {
  const lucide = (await import('@iconify-json/lucide/icons.json')).default
  const iconSets = { lucide }
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
