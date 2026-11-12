import { expect, it, vi } from 'vitest'

// The module registers the block on import; give it a minimal wp global.
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

const { isContainer, reactProps, safeTag } = await import('./common-block')

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
