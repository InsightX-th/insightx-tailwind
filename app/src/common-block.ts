import { __ } from './config'

/**
 * Editor side of `windpress/common-block` (attributes + render live in
 * src/Integration/CommonBlock.php). Containers hold inner blocks; leaves show
 * their content. save() must match what WindPress stored: InnerBlocks for
 * containers, nothing for leaves (they render on the server).
 */
const { blocks, blockEditor, components, element, data } = window.wp
const h = element.createElement

interface Attrs {
  tagName?: string
  contentType?: 'empty' | 'text' | 'html'
  content?: string
  selfClosing?: boolean
  globalAttrs?: Record<string, string>
  className?: string
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set'])
/** Attributes that would break selecting/editing inside the canvas. */
const EDITOR_SKIP = new Set(['inert', 'selected', 'autofocus', 'contenteditable', 'popover'])

export function safeTag(tag: string | undefined): string {
  const t = (tag ?? 'div').toLowerCase()
  return /^[a-z][a-z0-9-]*$/.test(t) && !BLOCKED_TAGS.has(t) ? t : 'div'
}

export function isContainer(a: Attrs): boolean {
  const tag = safeTag(a.tagName)
  return a.tagName !== 'cb-text-node' && !a.selfClosing && !VOID_TAGS.has(tag) && (a.contentType ?? 'empty') === 'empty'
}

function styleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim()
    out[prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = decl.slice(i + 1).trim()
  }
  return out
}

/** HTML attribute map -> React props for the editor preview. */
export function reactProps(attrs: Record<string, string>): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [rawName, value] of Object.entries(attrs)) {
    const name = rawName.toLowerCase()
    if (name.startsWith('on') || EDITOR_SKIP.has(name) || name === 'class') continue
    if (name === 'style') props.style = styleObject(value)
    else if (name === 'for') props.htmlFor = value
    else if (name === 'value') props.defaultValue = value
    else if (name === 'checked') props.defaultChecked = true
    else if (name === 'tabindex') props.tabIndex = value
    else if (value === '' && !name.startsWith('data-') && !name.startsWith('aria-')) props[rawName] = true
    else props[rawName] = value
  }
  return props
}

/**
 * Tags RichText round-trips without loss (its registered formats). Anything
 * else — a <span class>, an <a class>, a comment — would be dropped on the
 * first keystroke, so such content stays sidebar-only.
 */
const INLINE_TAGS = new Set(['strong', 'em', 'br', 'code', 's', 'sub', 'sup', 'kbd'])
const LINK_ATTRS = new Set(['href', 'target', 'rel'])

export function inlineEditable(content: string): boolean {
  if (content.includes('<!--')) return false
  for (const m of content.matchAll(/<\s*(\/?)\s*([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const name = (m[2] ?? '').toLowerCase()
    const rest = (m[3] ?? '').replace(/\/\s*$/, '').trim()
    if (m[1]) {
      if (!INLINE_TAGS.has(name) && name !== 'a') return false
      continue
    }
    if (name === 'a') {
      for (const attr of rest.matchAll(/([^\s=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+))?/g)) {
        if (!LINK_ATTRS.has((attr[1] ?? '').toLowerCase())) return false
      }
      continue
    }
    if (!INLINE_TAGS.has(name) || rest !== '') return false
  }
  return true
}

const COMMON_TAGS = [
  'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'p', 'span', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'img', 'svg', 'figure', 'figcaption', 'blockquote',
  'form', 'label', 'input', 'textarea', 'select', 'option', 'details', 'summary',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'strong', 'em', 'cb-text-node',
]

type AttrRow = [string, string]

function AttributeRows({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  // Local rows so a half-typed (empty) name doesn't vanish on the next render.
  const [rows, setRows] = element.useState<AttrRow[]>(Object.entries(value))
  const commit = (next: AttrRow[]) => {
    setRows(next)
    onChange(Object.fromEntries(next.filter(([name]) => name.trim() !== '').map(([n, v]) => [n.trim(), v])))
  }
  return h(
    'div',
    { className: 'ixt-attrs' },
    rows.length === 0 ? h('p', { className: 'ixt-attrs__empty' }, __('No attributes yet.')) : null,
    ...rows.map(([name, val], i) =>
      h(
        'div',
        { className: 'ixt-attrs__row', key: i },
        h('input', {
          className: 'ixt-attrs__name',
          value: name,
          placeholder: 'name',
          'aria-label': __('Attribute name'),
          spellCheck: false,
          onChange: (e: { target: { value: string } }) => commit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r))),
        }),
        h('span', { className: 'ixt-attrs__eq', 'aria-hidden': true }, '='),
        h('input', {
          className: 'ixt-attrs__value',
          value: val,
          placeholder: 'value',
          'aria-label': __('Attribute value'),
          spellCheck: false,
          onChange: (e: { target: { value: string } }) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r))),
        }),
        h(components.Button, {
          icon: 'no-alt',
          size: 'small',
          label: __('Remove attribute'),
          className: 'ixt-attrs__remove',
          onClick: () => commit(rows.filter((_, j) => j !== i)),
        }),
      ),
    ),
    h(components.Button, { variant: 'secondary', size: 'compact', icon: 'plus-alt2', className: 'ixt-attrs__add', onClick: () => setRows([...rows, ['', '']]) }, __('Add attribute')),
  )
}

function ContentTypeControl({ value, onChange }: { value: string; onChange: (v: Attrs['contentType']) => void }) {
  const options = [
    { value: 'empty', label: __('Inner blocks') },
    { value: 'text', label: __('Text') },
    { value: 'html', label: __('HTML') },
  ]
  const Group = components.__experimentalToggleGroupControl
  const Option = components.__experimentalToggleGroupControlOption
  if (Group && Option) {
    return h(
      Group,
      { label: __('Content'), value, isBlock: true, onChange, __next40pxDefaultSize: true, __nextHasNoMarginBottom: true },
      ...options.map((o) => h(Option, { key: o.value, value: o.value, label: o.label })),
    )
  }
  return h(components.SelectControl, { label: __('Content'), value, options, onChange, __next40pxDefaultSize: true, __nextHasNoMarginBottom: true })
}

interface EditProps {
  attributes: Attrs
  setAttributes: (a: Partial<Attrs>) => void
  isSelected: boolean
  clientId: string
}

function Edit({ attributes, setAttributes, isSelected, clientId }: EditProps) {
  const a = attributes
  const tag = safeTag(a.tagName)
  const globalAttrs = a.globalAttrs ?? {}
  const contentType = a.contentType ?? 'empty'
  const isTextNode = a.tagName === 'cb-text-node'

  // `ixt-cb` hooks assets/editor-canvas.css, which undoes the classic editor's per-block layout.
  const blockProps = blockEditor.useBlockProps({ ...reactProps(globalAttrs), className: 'ixt-cb' })
  const childCount = data.useSelect((select) => select('core/block-editor').getBlockCount(clientId), [clientId])
  // Always called (hooks order); only used for containers. The "+" shows only on a selected,
  // empty container — one per container would break the layout of the design.
  const innerBlocksProps = blockEditor.useInnerBlocksProps(blockProps, {
    renderAppender: isSelected && childCount === 0 ? blockEditor.InnerBlocks.ButtonBlockAppender : false,
  })

  const inspector = h(
    blockEditor.InspectorControls,
    null,
    h(
      components.PanelBody,
      {
        title: h('span', { className: 'ixt-panel__title' }, __('Element'), h('code', { className: 'ixt-tag-badge' }, isTextNode ? 'text' : `<${tag}>`)),
        initialOpen: true,
        className: 'ixt-panel',
      },
      h(
        'div',
        { className: 'ixt-field' },
        h(components.TextControl, {
          label: __('HTML tag'),
          value: a.tagName ?? 'div',
          list: 'ixt-tag-list',
          className: 'ixt-mono',
          spellCheck: false,
          onChange: (v: string) => setAttributes({ tagName: v.trim().toLowerCase() || 'div' }),
          __next40pxDefaultSize: true,
          __nextHasNoMarginBottom: true,
        }),
        h('datalist', { id: 'ixt-tag-list' }, ...COMMON_TAGS.map((t) => h('option', { key: t, value: t }))),
        h('p', { className: 'ixt-help' }, __('Use cb-text-node for plain text without a wrapper.')),
      ),
      isTextNode || a.selfClosing || VOID_TAGS.has(tag)
        ? null
        : h('div', { className: 'ixt-field' }, h(ContentTypeControl, { value: contentType, onChange: (v: Attrs["contentType"]) => setAttributes({ contentType: v }) })),
      contentType !== 'empty' || isTextNode
        ? h(
            'div',
            { className: 'ixt-field' },
            h(components.TextareaControl, {
              label: contentType === 'html' ? 'HTML' : __('Text'),
              value: a.content ?? '',
              rows: 5,
              className: 'ixt-mono',
              spellCheck: false,
              onChange: (v: string) => setAttributes({ content: v }),
              __nextHasNoMarginBottom: true,
            }),
          )
        : null,
      h(
        'div',
        { className: 'ixt-field' },
        h('span', { className: 'ixt-label' }, __('Attributes')),
        h(AttributeRows, { value: globalAttrs, onChange: (v: Record<string, string>) => setAttributes({ globalAttrs: v }) }),
      ),
    ),
  )

  // Text content is typed straight on the canvas (caret, toolbar) when RichText can keep it intact.
  const content = a.content ?? ''
  const editOnCanvas = (isTextNode || contentType === 'text') && !a.selfClosing && !VOID_TAGS.has(tag) && inlineEditable(content)

  let el: unknown
  if (editOnCanvas) {
    el = h(blockEditor.RichText, {
      ...blockProps,
      tagName: isTextNode ? 'span' : tag,
      value: content,
      onChange: (v: string) => setAttributes({ content: v }),
      allowedFormats: ['core/bold', 'core/italic', 'core/link', 'core/code', 'core/strikethrough', 'core/subscript', 'core/superscript', 'core/keyboard'],
      placeholder: __('Type text…'),
    })
  } else if (a.tagName === 'cb-text-node') {
    el = h('span', blockProps, content)
  } else if (a.selfClosing || VOID_TAGS.has(tag)) {
    el = h(tag, blockProps)
  } else if ((a.contentType ?? 'empty') !== 'empty') {
    el = h(tag, { ...blockProps, dangerouslySetInnerHTML: { __html: a.content ?? '' } })
  } else {
    el = h(tag, innerBlocksProps)
  }
  return h(element.Fragment, null, inspector, el)
}

blocks.registerBlockType('windpress/common-block', {
  title: __('Common Block'),
  icon: 'editor-code',
  edit: Edit,
  save: ({ attributes }: { attributes: Attrs }) => (isContainer(attributes) ? h(blockEditor.InnerBlocks.Content) : null),
  __experimentalLabel: (attributes: Attrs & { metadata?: { name?: string } }, { context }: { context: string }) =>
    context === 'list-view' || context === 'breadcrumb'
      ? attributes.metadata?.name ?? safeTag(attributes.tagName)
      : undefined,
})
