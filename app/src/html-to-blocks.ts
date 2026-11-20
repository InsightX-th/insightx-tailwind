/**
 * HTML -> Common Block tree, for the "Transform to Common Block" action on a
 * Custom HTML block. Same tags, classes and attributes, so the frontend renders
 * the same markup; plain text becomes editable on the canvas.
 * Works on a minimal node shape so it can be unit-tested without a DOM.
 */
export interface NodeLike {
  nodeType: number // 1 element, 3 text, anything else ignored (comments…)
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<NodeLike>
  attributes?: ArrayLike<{ name: string; value: string }>
  innerHTML?: string
  outerHTML?: string
}

export interface BlockSpec {
  name: 'windpress/common-block' | 'core/html'
  attributes: Record<string, unknown>
  innerBlocks: BlockSpec[]
}

/** Rendered by Common Block as <div> (see CommonBlock::BLOCKED_TAGS), so keep them as raw HTML. */
const RAW_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'noscript', 'template'])
/** Content Common Block can't model as child blocks; kept as HTML inside the element. */
const HTML_CONTENT_TAGS = new Set(['svg', 'math', 'textarea', 'pre'])

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

const ELEMENT = 1
const TEXT = 3

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function meaningful(node: NodeLike): boolean {
  return node.nodeType === ELEMENT || (node.nodeType === TEXT && (node.textContent ?? '').trim() !== '')
}

function common(attributes: Record<string, unknown>, innerBlocks: BlockSpec[] = []): BlockSpec {
  return { name: 'windpress/common-block', attributes, innerBlocks }
}

function elementSpec(el: NodeLike): BlockSpec {
  const tag = el.nodeName.toLowerCase()
  if (RAW_TAGS.has(tag)) return { name: 'core/html', attributes: { content: el.outerHTML ?? '' }, innerBlocks: [] }

  const attrs: Record<string, unknown> = { tagName: tag }
  const globalAttrs: Record<string, string> = {}
  for (const { name, value } of Array.from(el.attributes ?? [])) {
    if (name.toLowerCase() === 'class') {
      if (value.trim() !== '') attrs.className = value.trim().replace(/\s+/g, ' ')
    } else {
      globalAttrs[name] = value
    }
  }
  if (Object.keys(globalAttrs).length > 0) attrs.globalAttrs = globalAttrs

  const children = Array.from(el.childNodes).filter(meaningful)
  if (children.length === 0) return common(attrs)

  const inner = (el.innerHTML ?? '').trim()
  if (HTML_CONTENT_TAGS.has(tag)) return common({ ...attrs, contentType: 'html', content: inner })
  // Only text and inline formatting RichText keeps (strong, em, br, plain links): type it on the canvas.
  if (inlineEditable(inner)) return common({ ...attrs, contentType: 'text', content: inner.replace(/\s+/g, ' ') })

  return common(attrs, nodesToSpecs(el.childNodes))
}

/** Text between sibling elements: collapse whitespace, keep one space where words would otherwise touch. */
function textSpec(text: string, first: boolean, last: boolean): BlockSpec | null {
  let t = text.replace(/\s+/g, ' ')
  if (first) t = t.trimStart()
  if (last) t = t.trimEnd()
  return t.trim() === '' ? null : common({ tagName: 'cb-text-node', contentType: 'text', content: escapeText(t) })
}

export function nodesToSpecs(nodes: ArrayLike<NodeLike>): BlockSpec[] {
  const list = Array.from(nodes).filter(meaningful)
  const out: BlockSpec[] = []
  list.forEach((node, i) => {
    if (node.nodeType === ELEMENT) out.push(elementSpec(node))
    else {
      const spec = textSpec(node.textContent ?? '', i === 0, i === list.length - 1)
      if (spec) out.push(spec)
    }
  })
  return out
}

/* ------------------------------------------------------------------ */
/* Blocks -> HTML (the "Export HTML" action). Mirrors CommonBlock::render. */

export interface ExportBlock {
  name: string
  attributes: Record<string, unknown>
  innerBlocks: ExportBlock[]
  originalContent?: string
}

const EXPORT_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function exportAttrs(a: Record<string, unknown>): string {
  const global = (a.globalAttrs ?? {}) as Record<string, unknown>
  const classes = [a.className, global.class, a.align === 'wide' || a.align === 'full' ? `align${String(a.align)}` : '']
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim())
  let out = classes.length > 0 ? ` class="${escAttr(classes.join(' '))}"` : ''
  for (const [name, value] of Object.entries(global)) {
    if (name.toLowerCase() === 'class' || value === false || value === null || value === undefined) continue
    out += value === '' || value === true ? ` ${name}` : ` ${name}="${escAttr(String(value))}"`
  }
  return out
}

function exportBlock(b: ExportBlock, other: (b: ExportBlock) => string, depth: number): string {
  if (b.name === 'core/html') return String(b.attributes.content || b.originalContent || '').trim()
  if (b.name !== 'windpress/common-block') return other(b).trim()

  const a = b.attributes
  const tag = String(a.tagName ?? 'div').toLowerCase()
  const content = typeof a.content === 'string' ? a.content : ''
  if (tag === 'cb-text-node') return content

  const open = `<${tag}${exportAttrs(a)}>`
  if (a.selfClosing === true || EXPORT_VOID_TAGS.has(tag)) return open

  const body = a.contentType === 'text' || a.contentType === 'html' ? content : ''
  let inner = ''
  if (b.innerBlocks.length > 0) {
    // Text nodes between siblings are inline content: keep them on one line so no
    // whitespace is added; element-only children get one per line, indented.
    inner = b.innerBlocks.some((c) => c.attributes.tagName === 'cb-text-node')
      ? b.innerBlocks.map((c) => exportBlock(c, other, depth + 1)).join('')
      : `\n${blocksToHtml(b.innerBlocks, other, depth + 1)}\n${'  '.repeat(depth)}`
  }
  return `${open}${body}${inner}</${tag}>`
}

/** Common Blocks (and Custom HTML) as clean HTML; other blocks go through `other` (their saved markup). */
export function blocksToHtml(blocks: ExportBlock[], other: (b: ExportBlock) => string = () => '', depth = 0): string {
  return blocks
    .map((b) => exportBlock(b, other, depth))
    .filter((html) => html !== '')
    .map((html) => '  '.repeat(depth) + html)
    .join('\n')
}
