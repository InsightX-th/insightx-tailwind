import { expect, it } from 'vitest'
import { shouldRemove } from './mirror'

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
