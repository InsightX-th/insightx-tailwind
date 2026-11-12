// Minimal typings for the WordPress globals we touch (provided by core script deps).
type WpElement = unknown
type ComponentType<P> = (props: P) => WpElement

interface BlockEditProps {
  name: string
  isSelected: boolean
  attributes: { className?: string } & Record<string, unknown>
  setAttributes: (attrs: { className?: string }) => void
}

interface Window {
  wp: {
    hooks: { addFilter: (hook: string, ns: string, cb: (...args: never[]) => unknown) => void }
    element: {
      createElement: (type: unknown, props?: object | null, ...children: unknown[]) => WpElement
      Fragment: unknown
      useState: <T>(init: T) => [T, (v: T) => void]
      useEffect: (fn: () => void | (() => void), deps: unknown[]) => void
    }
    compose: { createHigherOrderComponent: <P>(fn: (C: ComponentType<P>) => ComponentType<P>, name: string) => unknown }
    blocks: { registerBlockType: (name: string, settings: Record<string, unknown>) => void }
    blockEditor: {
      InspectorControls: unknown
      InnerBlocks: { Content: unknown; ButtonBlockAppender: unknown }
      useBlockProps: (props?: Record<string, unknown>) => Record<string, unknown>
      useInnerBlocksProps: (props: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown>
    }
    components: {
      PanelBody: unknown
      FormTokenField: unknown
      Button: unknown
      TextControl: unknown
      TextareaControl: unknown
      SelectControl: unknown
      CheckboxControl: unknown
      __experimentalToggleGroupControl?: unknown
      __experimentalToggleGroupControlOption?: unknown
    }
    data: {
      subscribe: (cb: () => void) => () => void
      select: (store: 'core/editor') => { isSavingPost?: () => boolean; isAutosavingPost: () => boolean } | undefined
      useSelect: <T>(fn: (select: (store: 'core/block-editor') => { getBlockCount: (clientId: string) => number }) => T, deps: unknown[]) => T
    }
  }
}
