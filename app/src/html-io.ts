import { __ } from './config'
import { blocksToHtml, nodesToSpecs, type BlockSpec, type ExportBlock } from './html-to-blocks'

/**
 * "Import HTML" / "Export HTML" buttons in the editor's top toolbar (post, site and
 * widgets editors). Import pastes HTML as Common Blocks; export shows the selected
 * blocks (or the whole document) as clean HTML.
 */
const { blocks, components, element } = window.wp
const h = element.createElement

interface EditorStore {
  getSelectedBlockClientId(): string | null
  getSelectedBlockClientIds(): string[]
  getBlockRootClientId(clientId: string): string | null
  getBlockIndex(clientId: string): number
  getBlocks(rootClientId?: string): ExportBlock[]
  getBlocksByClientId(clientIds: string[]): (ExportBlock | null)[]
}
interface EditorActions {
  insertBlocks(blocks: unknown[], index?: number, rootClientId?: string | null): void
}
const data = window.wp.data as unknown as {
  select(store: 'core/block-editor'): EditorStore | undefined
  dispatch(store: 'core/block-editor'): EditorActions
  subscribe(listener: () => void): () => void
}
const getBlockContent = (blocks as unknown as { getBlockContent: (block: ExportBlock) => string }).getBlockContent

/** Tags that must not be stretched full width when inserted at the top level. */
const NO_ALIGN = new Set(['script', 'style', 'link', 'meta', 'title', 'base'])

export function createBlocks(specs: BlockSpec[]): unknown[] {
  return specs.map((s) => blocks.createBlock(s.name, s.attributes, createBlocks(s.innerBlocks)))
}

/** Parse pasted HTML; null when it has no elements or text. */
function importHtml(html: string): string | null {
  const editor = data.select('core/block-editor')
  if (!editor) return __('The block editor is not ready yet.')
  const specs = nodesToSpecs(new DOMParser().parseFromString(html, 'text/html').body.childNodes)
  if (specs.length === 0) return __('No HTML elements found to import.')

  const selected = editor.getSelectedBlockClientId()
  const top = editor.getBlocks()
  if (!selected && top[0]?.name === 'core/widget-area') return __('Select a block first: the HTML is inserted after it.')

  if (!selected) {
    for (const s of specs) {
      if (s.name === 'windpress/common-block' && !NO_ALIGN.has(String(s.attributes.tagName))) s.attributes.align = 'full'
    }
    data.dispatch('core/block-editor').insertBlocks(createBlocks(specs))
  } else {
    data.dispatch('core/block-editor').insertBlocks(createBlocks(specs), editor.getBlockIndex(selected) + 1, editor.getBlockRootClientId(selected))
  }
  return null
}

function exportHtml(): string {
  const editor = data.select('core/block-editor')
  if (!editor) return ''
  const ids = editor.getSelectedBlockClientIds()
  let list = ids.length > 0 ? editor.getBlocksByClientId(ids).filter((b): b is ExportBlock => b !== null) : editor.getBlocks()
  // Widgets editor: the top level is widget areas; export what's inside them.
  if (list.every((b) => b.name === 'core/widget-area')) list = list.flatMap((b) => b.innerBlocks)
  // ponytail: non-Common blocks export their saved markup, inner block comments included.
  return blocksToHtml(list, (b) => getBlockContent(b))
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [html, setHtml] = element.useState('')
  const [error, setError] = element.useState('')
  const submit = () => {
    const problem = importHtml(html)
    if (problem) setError(problem)
    else onClose()
  }
  return h(
    components.Modal,
    { title: __('Import HTML'), onRequestClose: onClose, className: 'ixt-html-modal', size: 'large' },
    h('p', { className: 'ixt-help' }, __('Paste HTML. It becomes Common Blocks with the same tags, classes and attributes; text can be typed on the canvas.')),
    h(components.TextareaControl, {
      label: __('HTML'),
      hideLabelFromVision: true,
      value: html,
      rows: 18,
      className: 'ixt-mono',
      spellCheck: false,
      onChange: (v: string) => {
        setHtml(v)
        setError('')
      },
      __nextHasNoMarginBottom: true,
    }),
    error ? h('p', { className: 'ixt-html-modal__error', role: 'alert' }, error) : null,
    h(
      'div',
      { className: 'ixt-html-modal__actions' },
      h(components.Button, { variant: 'tertiary', onClick: onClose }, __('Cancel')),
      h(components.Button, { variant: 'primary', disabled: html.trim() === '', onClick: submit }, __('Import')),
    ),
  )
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const [html] = element.useState(exportHtml())
  const [copied, setCopied] = element.useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(html).then(() => setCopied(true))
  }
  return h(
    components.Modal,
    { title: __('Export HTML'), onRequestClose: onClose, className: 'ixt-html-modal', size: 'large' },
    h('p', { className: 'ixt-help' }, __('HTML of the selected blocks, or of the whole page when nothing is selected.')),
    h(components.TextareaControl, {
      label: __('HTML'),
      hideLabelFromVision: true,
      value: html || __('No blocks to export.'),
      rows: 18,
      className: 'ixt-mono',
      readOnly: true,
      spellCheck: false,
      onChange: () => {},
      onFocus: (e: { target: HTMLTextAreaElement }) => e.target.select(),
      __nextHasNoMarginBottom: true,
    }),
    h(
      'div',
      { className: 'ixt-html-modal__actions' },
      h(components.Button, { variant: 'tertiary', onClick: onClose }, __('Close')),
      h(components.Button, { variant: 'primary', disabled: html === '', onClick: copy }, copied ? __('Copied') : __('Copy HTML')),
    ),
  )
}

function HtmlTools() {
  const [open, setOpen] = element.useState<'' | 'import' | 'export'>('')
  const close = () => setOpen('')
  return h(
    element.Fragment,
    null,
    h(components.Button, { icon: 'download', label: __('Import HTML'), showTooltip: true, size: 'compact', onClick: () => setOpen('import') }),
    h(components.Button, { icon: 'upload', label: __('Export HTML'), showTooltip: true, size: 'compact', onClick: () => setOpen('export') }),
    open === 'import' ? h(ImportModal, { onClose: close }) : null,
    open === 'export' ? h(ExportModal, { onClose: close }) : null,
  )
}

const TOOLBAR = '.editor-document-tools__left, .edit-post-header-toolbar, .edit-widgets-header-toolbar'
let host: HTMLElement | null = null

/**
 * Place the buttons right after the editor's toolbar — a sibling, never inside it:
 * WordPress's accessible toolbar rebuilds itself when it finds controls that aren't
 * ToolbarItems, which dropped our node, we re-added it, and the header flickered.
 * The header can re-render: move the same node (one React root) behind the new toolbar.
 */
function mount() {
  const bar = document.querySelector(TOOLBAR)
  if (!bar) return
  const toolbar = bar.closest('[role="toolbar"]') ?? bar
  if (host?.isConnected && host.previousElementSibling === toolbar) return
  if (!host) {
    host = document.createElement('div')
    host.className = 'ixt-html-tools'
    // Inline so the buttons sit in the header row even before editor-sidebar.css applies.
    host.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0'
    element.createRoot(host).render(h(HtmlTools))
  }
  toolbar.after(host)
}

// Watch the DOM, not the data store: the Widgets editor keeps its blocks in a nested
// registry, so the default store may never change and the toolbar would stay empty.
let queued = false
new MutationObserver(() => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    mount()
  })
}).observe(document.documentElement, { childList: true, subtree: true })
mount()
