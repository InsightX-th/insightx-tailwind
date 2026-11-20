import { __ } from './config'
import { inlineEditable, nodesToSpecs } from './html-to-blocks'
import { createBlocks } from './html-io'

export { inlineEditable }

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

const COMMON_TAGS = [
  'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'p', 'span', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'img', 'svg', 'figure', 'figcaption', 'blockquote',
  'form', 'label', 'input', 'textarea', 'select', 'option', 'details', 'summary',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'strong', 'em', 'cb-text-node',
]

type AttrRow = [string, string]

/** URL attributes that can be picked from the Media Library, and which media types fit each element. */
const MEDIA_ATTRS = new Set(['src', 'poster'])
const MEDIA_TYPES: Record<string, string[]> = { img: ['image'], video: ['video'], audio: ['audio'] }

interface MediaItem {
  url: string
  alt?: string
  width?: number
  height?: number
}

/** Set (or, with '', drop) one attribute; an empty width="" would render as a bare `width`. */
function withAttr(attrs: Record<string, string>, name: string, value: string): Record<string, string> {
  const next = { ...attrs }
  if (value === '') delete next[name]
  else next[name] = value
  return next
}

const NEW_TAB_REL = ['noopener', 'noreferrer']
const LinkControl = (blockEditor as unknown as { LinkControl?: unknown; __experimentalLinkControl?: unknown }).LinkControl
  ?? (blockEditor as unknown as { __experimentalLinkControl?: unknown }).__experimentalLinkControl

/** target="_blank" + rel noopener/noreferrer, keeping any other rel tokens (e.g. nofollow). */
function withNewTab(attrs: Record<string, string>, on: boolean): Record<string, string> {
  const rel = (attrs.rel ?? '').split(/\s+/).filter((t) => t !== '' && !NEW_TAB_REL.includes(t))
  const next = withAttr(attrs, 'target', on ? '_blank' : '')
  return withAttr(next, 'rel', [...rel, ...(on ? NEW_TAB_REL : [])].join(' '))
}

/** <a> settings like WindPress: URL, pick a post/page, open in new tab, remove. */
function LinkPanel({ attrs, onChange }: { attrs: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [picking, setPicking] = element.useState(false)
  const href = attrs.href ?? ''
  const newTab = attrs.target === '_blank'
  const remove = () => onChange(withNewTab(withAttr(attrs, 'href', ''), false))
  return h(
    components.PanelBody,
    { title: __('Link'), initialOpen: true, className: 'ixt-panel ixt-link-panel' },
    picking && LinkControl
      ? h(
          'div',
          { className: 'ixt-link-panel__picker' },
          h(LinkControl, {
            value: { url: href, opensInNewTab: newTab },
            onChange: (link: { url?: string; opensInNewTab?: boolean }) => {
              onChange(withNewTab(withAttr(attrs, 'href', link.url ?? ''), link.opensInNewTab === true))
              setPicking(false)
            },
            onRemove: () => {
              remove()
              setPicking(false)
            },
          }),
          h(components.Button, { variant: 'secondary', onClick: () => setPicking(false), __next40pxDefaultSize: true }, __('Cancel')),
        )
      : h(
          'div',
          { className: 'ixt-link-panel__fields' },
          h(components.TextControl, {
            label: __('URL'),
            value: href,
            type: 'url',
            placeholder: 'https://example.com',
            className: 'ixt-mono',
            onChange: (v: string) => onChange(withAttr(attrs, 'href', v.trim())),
            __next40pxDefaultSize: true,
            __nextHasNoMarginBottom: true,
          }),
          LinkControl ? h(components.Button, { variant: 'secondary', onClick: () => setPicking(true), __next40pxDefaultSize: true }, __('Choose from posts and pages')) : null,
          href
            ? h(components.ToggleControl, {
                label: __('Open in new tab'),
                checked: newTab,
                onChange: (on: boolean) => onChange(withNewTab(attrs, on)),
                __nextHasNoMarginBottom: true,
              })
            : null,
          href ? h(components.Button, { variant: 'secondary', isDestructive: true, onClick: remove, __next40pxDefaultSize: true }, __('Remove link')) : null,
        ),
  )
}

/** <img> settings like WindPress: preview, choose/replace/remove from the Media Library, alt, size. */
function ImagePanel({ attrs, onChange }: { attrs: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const src = attrs.src ?? ''
  const field = (name: string, label: string, extra: Record<string, unknown> = {}) =>
    h(components.TextControl, {
      label,
      value: attrs[name] ?? '',
      onChange: (v: string) => onChange(withAttr(attrs, name, v)),
      __next40pxDefaultSize: true,
      __nextHasNoMarginBottom: true,
      ...extra,
    })
  return h(
    components.PanelBody,
    { title: __('Image'), initialOpen: true, className: 'ixt-panel ixt-image-panel' },
    h(
      blockEditor.MediaUploadCheck,
      null,
      h(blockEditor.MediaUpload, {
        allowedTypes: ['image'],
        // Picking an image takes its alt text and size from the Media Library too.
        onSelect: (media: MediaItem) =>
          onChange(
            withAttr(
              withAttr(withAttr(withAttr(attrs, 'src', media.url), 'alt', media.alt ?? ''), 'width', media.width ? String(media.width) : ''),
              'height',
              media.height ? String(media.height) : '',
            ),
          ),
        render: ({ open }: { open: () => void }) =>
          h(
            'div',
            { className: 'ixt-image-panel__media' },
            src ? h('img', { src, alt: attrs.alt ?? '', className: 'ixt-image-panel__preview' }) : null,
            h(components.Button, { variant: src ? 'secondary' : 'primary', onClick: open, __next40pxDefaultSize: true }, src ? __('Replace image') : __('Select image')),
            src
              ? h(components.Button, { variant: 'secondary', isDestructive: true, onClick: () => onChange(withAttr(attrs, 'src', '')), __next40pxDefaultSize: true }, __('Remove image'))
              : null,
          ),
      }),
    ),
    h('div', { className: 'ixt-field' }, field('alt', __('Alt text'), { help: __('Describe the image for screen readers. Leave empty for decorative images.') })),
    h('div', { className: 'ixt-image-panel__size' }, field('width', __('Width'), { type: 'number', min: 0 }), field('height', __('Height'), { type: 'number', min: 0 })),
  )
}

/** "Choose from Media Library" button next to src / poster. */
function MediaPicker({ tag, name, onSelect }: { tag: string; name: string; onSelect: (media: MediaItem) => void }) {
  const allowedTypes = name === 'poster' ? ['image'] : MEDIA_TYPES[tag]
  return h(
    blockEditor.MediaUploadCheck,
    null,
    h(blockEditor.MediaUpload, {
      onSelect,
      allowedTypes,
      render: ({ open }: { open: () => void }) =>
        h(components.Button, { icon: 'format-image', size: 'small', label: __('Choose from Media Library'), className: 'ixt-attrs__media', onClick: open }),
    }),
  )
}

function AttributeRows({ tag, value, onChange }: { tag: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  // Local rows so a half-typed (empty) name doesn't vanish on the next render.
  const [rows, setRows] = element.useState<AttrRow[]>(Object.entries(value))
  const fromRows = (list: AttrRow[]) => JSON.stringify(Object.fromEntries(list.filter(([n]) => n.trim() !== '').map(([n, v]) => [n.trim(), v])))
  // Changed elsewhere (e.g. the Image panel): reload. Our own edits already match, so typing isn't reset.
  element.useEffect(() => {
    if (fromRows(rows) !== JSON.stringify(value)) setRows(Object.entries(value))
  }, [JSON.stringify(value)])
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
        h(
          'div',
          { className: 'ixt-attrs__value-wrap' },
          h('input', {
            className: 'ixt-attrs__value',
            value: val,
            placeholder: 'value',
            'aria-label': __('Attribute value'),
            spellCheck: false,
            onChange: (e: { target: { value: string } }) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r))),
          }),
          tag !== 'img' && MEDIA_ATTRS.has(name.trim().toLowerCase())
            ? h(MediaPicker, {
                tag,
                name: name.trim().toLowerCase(),
                onSelect: (media: MediaItem) => commit(rows.map((r, j) => (j === i ? [r[0], media.url] : r))),
              })
            : null,
        ),
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
    tag === 'img' ? h(ImagePanel, { attrs: globalAttrs, onChange: (v: Record<string, string>) => setAttributes({ globalAttrs: v }) }) : null,
    tag === 'a' ? h(LinkPanel, { attrs: globalAttrs, onChange: (v: Record<string, string>) => setAttributes({ globalAttrs: v }) }) : null,
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
        h(AttributeRows, { tag, value: globalAttrs, onChange: (v: Record<string, string>) => setAttributes({ globalAttrs: v }) }),
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

/**
 * Custom HTML -> Common Blocks: same markup, text editable on the canvas.
 * Gets the whole block: since WP 7.x core/html no longer parses its markup into
 * `attributes.content` (and widgets saved as raw HTML never had it), so fall back
 * to the block's original markup.
 */
function fromHtml(block: { attributes?: { content?: string }; originalContent?: string }): unknown[] {
  const content = block.attributes?.content || block.originalContent || ''
  const body = new DOMParser().parseFromString(content, 'text/html').body
  const result = createBlocks(nodesToSpecs(body.childNodes))
  return result.length > 0 ? result : [blocks.createBlock('windpress/common-block', {}, [])]
}

blocks.registerBlockType('windpress/common-block', {
  title: __('Common Block'),
  icon: 'editor-code',
  edit: Edit,
  transforms: { from: [{ type: 'block', blocks: ['core/html'], __experimentalConvert: fromHtml }] },
  save: ({ attributes }: { attributes: Attrs }) => (isContainer(attributes) ? h(blockEditor.InnerBlocks.Content) : null),
  __experimentalLabel: (attributes: Attrs & { metadata?: { name?: string } }, { context }: { context: string }) =>
    context === 'list-view' || context === 'breadcrumb'
      ? attributes.metadata?.name ?? safeTag(attributes.tagName)
      : undefined,
})
