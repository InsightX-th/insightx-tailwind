import { __, getConfig } from './config'

/**
 * "Page CSS" panel in the post sidebar (Document tab): attach page-only CSS
 * files to this post. Stored in post meta `_ixt_css_files` (src/PageCss.php).
 * Only in the post editor: the widgets/site editors have no post meta.
 */
interface EditorStore {
  getEditedPostAttribute: (key: 'meta') => Record<string, unknown> | undefined
}

export function registerPageCssPanel(): void {
  const wp = window.wp as typeof window.wp & {
    plugins?: { registerPlugin: (name: string, settings: { render: () => unknown }) => void }
    editor?: { PluginDocumentSettingPanel?: unknown }
    editPost?: { PluginDocumentSettingPanel?: unknown }
  }
  const Panel = wp.editor?.PluginDocumentSettingPanel ?? wp.editPost?.PluginDocumentSettingPanel
  const options = getConfig().pageFileOptions
  if (!wp.plugins || !Panel || !options) return

  const { element, components, data } = wp
  const h = element.createElement
  const select = data.select as unknown as (store: 'core/editor') => EditorStore | undefined
  const useSelect = data.useSelect as unknown as <T>(fn: (s: typeof select) => T, deps: unknown[]) => T
  const useDispatch = (data as unknown as { useDispatch: (store: 'core/editor') => { editPost: (edits: object) => void } }).useDispatch

  function PageCssPanel() {
    const meta = useSelect((s) => s('core/editor')?.getEditedPostAttribute('meta'), [])
    const { editPost } = useDispatch('core/editor')
    if (!meta) return null // post type without meta support
    const raw = meta._ixt_css_files
    const selected = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    const toggle = (file: string, on: boolean) =>
      editPost({ meta: { ...meta, _ixt_css_files: on ? [...selected, file] : selected.filter((f) => f !== file) } })

    return h(
      Panel,
      { name: 'insightx-tailwind-page-css', title: __('Page CSS'), className: 'ixt-panel ixt-page-css' },
      options && options.length > 0
        ? h(
            'div',
            { className: 'ixt-page-css__list' },
            ...options.map((file) =>
              h(components.CheckboxControl, {
                key: file,
                label: h('code', null, file),
                checked: selected.includes(file),
                onChange: (on: boolean) => toggle(file, on),
                __nextHasNoMarginBottom: true,
              }),
            ),
          )
        : h('p', { className: 'ixt-help' }, __('No page CSS files yet. Files not imported by main.css can be attached to pages.')),
      h('p', { className: 'ixt-help' }, __('Files imported by main.css apply to every page. Save the page, then reload the editor to preview the change.')),
    )
  }

  wp.plugins.registerPlugin('insightx-tailwind-page-css', { render: PageCssPanel })
}
