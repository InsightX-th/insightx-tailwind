import { expect, it, vi } from 'vitest'

// The module registers the block (and the HTML toolbar listener) on import; give it a minimal wp global.
vi.stubGlobal('window', {
  wp: {
    blocks: { registerBlockType: vi.fn() },
    blockEditor: { InnerBlocks: {} },
    components: {},
    element: { createElement: vi.fn() },
    data: {},
  },
  insightxTailwind: { files: {}, restUrl: '', nonce: '' },
})
// html-io watches the DOM for the editor toolbar; no DOM here.
vi.stubGlobal('MutationObserver', class { observe() {} })
vi.stubGlobal('document', { querySelector: () => null, documentElement: {} })
vi.stubGlobal('requestAnimationFrame', () => 0)

const { inlineEditable, isContainer, reactProps, safeTag } = await import('./common-block')

it('maps HTML attributes to React props for the editor preview', () => {
  expect(
    reactProps({ href: '#a', 'aria-hidden': 'true', onclick: 'x()', for: 'f', style: 'color: red; --x: 1', open: '', 'data-open': '', inert: '' }),
  ).toEqual({ href: '#a', 'aria-hidden': 'true', htmlFor: 'f', style: { color: 'red', '--x': '1' }, open: true, 'data-open': '' })
})

it('classifies containers and sanitizes tags', () => {
  expect(isContainer({ tagName: 'section' })).toBe(true)
  expect(isContainer({ tagName: 'p', contentType: 'text' })).toBe(false)
  expect(isContainer({ tagName: 'img' })).toBe(false)
  expect(isContainer({ tagName: 'cb-text-node' })).toBe(false)
  expect(safeTag('script')).toBe('div')
  expect(safeTag('SVG')).toBe('svg')
  expect(safeTag('animate')).toBe('div')
  expect(safeTag('foreignObject')).toBe('div')
})

it('edits on the canvas only when RichText keeps the markup intact', () => {
  expect(inlineEditable('')).toBe(true)
  expect(inlineEditable('ออกแบบโดยทีม Agency\n  ราคา 7,990 บาท')).toBe(true)
  expect(inlineEditable('a <strong>b</strong> <em>c</em><br>d<br />')).toBe(true)
  expect(inlineEditable('<a href="/x" target="_blank" rel="noopener">link</a>')).toBe(true)
  expect(inlineEditable('x &amp; y &lt;3')).toBe(true)
  expect(inlineEditable('<span class="text-blue-500">x</span>')).toBe(false)
  expect(inlineEditable('<a href="/x" class="btn">x</a>')).toBe(false)
  expect(inlineEditable('<strong class="font-bold">x</strong>')).toBe(false)
  expect(inlineEditable('<div>x</div>')).toBe(false)
  expect(inlineEditable('x <!-- note --> y')).toBe(false)
})
