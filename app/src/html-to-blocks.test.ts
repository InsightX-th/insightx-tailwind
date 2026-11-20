import { expect, it } from 'vitest'
import { blocksToHtml, nodesToSpecs, type BlockSpec, type ExportBlock, type NodeLike } from './html-to-blocks'

// Tiny element/text builders: no DOM in the test environment.
const text = (t: string): NodeLike => ({ nodeType: 3, nodeName: '#text', textContent: t, childNodes: [] })
const comment = (t: string): NodeLike => ({ nodeType: 8, nodeName: '#comment', textContent: t, childNodes: [] })
function el(tag: string, attrs: Record<string, string>, children: NodeLike[], innerHTML = ''): NodeLike {
  const attrList = Object.entries(attrs).map(([name, value]) => ({ name, value }))
  const open = `<${tag}${attrList.map((a) => ` ${a.name}="${a.value}"`).join('')}>`
  return { nodeType: 1, nodeName: tag.toUpperCase(), textContent: '', childNodes: children, attributes: attrList, innerHTML, outerHTML: `${open}${innerHTML}</${tag}>` }
}

it('keeps tag, class and attributes; plain text becomes editable text content', () => {
  const [spec] = nodesToSpecs([el('a', { href: '#', class: ' block  rounded-full ' }, [text('\n  บทความ \n')], '\n  บทความ \n')])
  expect(spec).toEqual({
    name: 'windpress/common-block',
    attributes: { tagName: 'a', className: 'block rounded-full', globalAttrs: { href: '#' }, contentType: 'text', content: 'บทความ' },
    innerBlocks: [],
  })
})

it('splits icon + text into child blocks, drops comments and blank text', () => {
  const icon = el('span', { class: 'icon-[lucide--phone] size-4', 'aria-hidden': 'true' }, [])
  const [spec] = nodesToSpecs([
    el('a', { href: 'tel:1', class: 'flex' }, [text('\n '), icon, comment('x'), text('\n โทร 03-306-0264\n')], '<span class="icon-[lucide--phone] size-4" aria-hidden="true"></span> โทร'),
  ])
  expect(spec?.attributes.contentType).toBeUndefined()
  expect(spec?.innerBlocks.map((b) => b.attributes)).toEqual([
    { tagName: 'span', className: 'icon-[lucide--phone] size-4', globalAttrs: { 'aria-hidden': 'true' } },
    { tagName: 'cb-text-node', contentType: 'text', content: ' โทร 03-306-0264' },
  ])
})

it('keeps a space between inline words and escapes text', () => {
  const specs = nodesToSpecs([text('Call '), el('span', { class: 'x' }, [text('now')], 'now'), text(' a<b')])
  expect(specs.map((s) => s.attributes.content ?? s.attributes.tagName)).toEqual(['Call ', 'now', ' a&lt;b'])
})

it('keeps svg as HTML content and iframes/scripts as Custom HTML blocks', () => {
  const svg = el('svg', { viewBox: '0 0 24 24' }, [el('path', { d: 'M0 0' }, [])], '<path d="M0 0"/>')
  const map = el('iframe', { src: 'https://maps.example' }, [])
  const [s, i] = nodesToSpecs([svg, map])
  expect(s?.attributes).toMatchObject({ tagName: 'svg', contentType: 'html', content: '<path d="M0 0"/>' })
  expect(i).toEqual({ name: 'core/html', attributes: { content: '<iframe src="https://maps.example"></iframe>' }, innerBlocks: [] })
})

it('keeps void elements and inline formatting', () => {
  const [img, p] = nodesToSpecs([
    el('img', { src: '/a.webp', alt: '' }, []),
    el('p', {}, [text('a '), el('strong', {}, [text('b')], 'b')], 'a <strong>b</strong>'),
  ])
  expect(img?.attributes).toEqual({ tagName: 'img', globalAttrs: { src: '/a.webp', alt: '' } })
  expect(p?.attributes).toEqual({ tagName: 'p', contentType: 'text', content: 'a <strong>b</strong>' })
})

const cb = (attributes: Record<string, unknown>, innerBlocks: ExportBlock[] = []): ExportBlock => ({ name: 'windpress/common-block', attributes, innerBlocks })

it('exports Common Blocks as clean, indented HTML', () => {
  const html = blocksToHtml([
    cb({ tagName: 'header', className: 'sticky top-0', align: 'full' }, [
      cb({ tagName: 'a', className: 'flex', globalAttrs: { href: '/?a=1&b="2"' } }, [
        cb({ tagName: 'span', className: 'icon-[lucide--phone]', globalAttrs: { 'aria-hidden': 'true' } }),
        cb({ tagName: 'cb-text-node', contentType: 'text', content: ' โทร' }),
      ]),
      cb({ tagName: 'p', contentType: 'text', content: 'a <strong>b</strong>' }),
      cb({ tagName: 'img', globalAttrs: { src: '/x.webp', alt: '' } }),
      cb({ tagName: 'details', globalAttrs: { open: '' } }),
    ]),
    { name: 'core/html', attributes: {}, innerBlocks: [], originalContent: '<iframe src="https://maps.example"></iframe>' },
  ])
  expect(html).toBe(
    [
      '<header class="sticky top-0 alignfull">',
      '  <a class="flex" href="/?a=1&amp;b=&quot;2&quot;"><span class="icon-[lucide--phone]" aria-hidden="true"></span> โทร</a>',
      '  <p>a <strong>b</strong></p>',
      '  <img src="/x.webp" alt>',
      '  <details open></details>',
      '</header>',
      '<iframe src="https://maps.example"></iframe>',
    ].join('\n'),
  )
})

it('round-trips HTML -> blocks -> HTML', () => {
  const a = el('a', { href: '#', class: 'btn' }, [el('span', { class: 'icon' }, []), text(' ขอใบเสนอราคา ')], '<span class="icon"></span> ขอใบเสนอราคา ')
  const toExport = (s: BlockSpec): ExportBlock => ({ name: s.name, attributes: s.attributes, innerBlocks: s.innerBlocks.map(toExport) })
  expect(blocksToHtml(nodesToSpecs([a]).map(toExport))).toBe('<a class="btn" href="#"><span class="icon"></span> ขอใบเสนอราคา</a>')
})

it('uses the fallback for other block types', () => {
  expect(blocksToHtml([{ name: 'core/paragraph', attributes: {}, innerBlocks: [] }], () => '<p>x</p>\n')).toBe('<p>x</p>')
})
