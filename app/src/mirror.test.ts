import { expect, it } from 'vitest'
import { shouldRemove, splitLayers } from './mirror'

const link = (id: string, href: string) => ({ id, href }) as HTMLLinkElement
const themes = ['http://x.test/wp-content/themes/child/', 'http://x.test/wp-content/themes/parent/']

it('drops editor-only CSS that the frontend does not have', () => {
  expect(shouldRemove(link('common-css', 'http://x.test/wp-admin/css/common.css'), themes)).toBe(true)
  expect(shouldRemove(link('wp-editor-classic-layout-styles-css', 'http://x.test/wp-includes/x.css'), themes)).toBe(true)
  expect(shouldRemove(link('p-admin-css', 'http://x.test/wp-content/themes/parent/assets/css/wp-admin.css'), themes)).toBe(true)
  // Editor UI and plugin styles stay.
  expect(shouldRemove(link('wp-components-css', 'http://x.test/wp-includes/components.css'), themes)).toBe(false)
  expect(shouldRemove(link('wp-block-editor-content-css', 'http://x.test/wp-includes/content.css'), themes)).toBe(false)
  expect(shouldRemove(link('yoast-css', 'http://x.test/wp-content/plugins/yoast/a.css'), ['', ...themes])).toBe(false)
})

it('un-layers CSS rules for the widgets canvas', () => {
  const rules = [
    { cssText: '@layer theme, base;' },
    { cssText: '@layer base { ul { list-style: none; } }', cssRules: [{ cssText: 'ul { list-style: none; }' }] },
    { cssText: '.p-4 { padding: 1rem; }' },
    { cssText: '@media (min-width: 40rem) { .sm\\:flex { display: flex; } }', cssRules: [{ cssText: '.sm\\:flex { display: flex; }' }] },
  ]
  expect(splitLayers(rules)).toEqual({
    layered: ['ul { list-style: none; }'],
    plain: ['.p-4 { padding: 1rem; }', '@media (min-width: 40rem) { .sm\\:flex { display: flex; } }'],
  })
})
