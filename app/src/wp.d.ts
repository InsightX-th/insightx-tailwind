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
      createRoot: (container: Element) => { render: (el: WpElement) => void }
    }
    compose: { createHigherOrderComponent: <P>(fn: (C: ComponentType<P>) => ComponentType<P>, name: string) => unknown }
    blocks: {
      registerBlockType: (name: string, settings: Record<string, unknown>) => void
      createBlock: (name: string, attributes?: Record<string, unknown>, innerBlocks?: unknown[]) => unknown
    }
    blockEditor: {
      InspectorControls: unknown
      MediaUpload: unknown
      MediaUploadCheck: unknown
      RichText: unknown
      InnerBlocks: { Content: unknown; ButtonBlockAppender: unknown }
      useBlockProps: (props?: Record<string, unknown>) => Record<string, unknown>
      useInnerBlocksProps: (props: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown>
    }
    components: {
      PanelBody: unknown
      Modal: unknown
      FormTokenField: unknown
      Button: unknown
      TextControl: unknown
      TextareaControl: unknown
      SelectControl: unknown
      CheckboxControl: unknown
      ToggleControl: unknown
      __experimentalToggleGroupControl?: unknown
      __experimentalToggleGroupControlOption?: unknown
    }
    data: {
      subscribe: (cb: () => void) => () => void
      select: {
        (store: 'core/editor'): { isSavingPost?: () => boolean; isAutosavingPost: () => boolean } | undefined
        (store: 'core/edit-widgets'): { isSavingWidgetAreas?: () => boolean } | undefined
      }
      useSelect: <T>(fn: (select: (store: 'core/block-editor') => { getBlockCount: (clientId: string) => number }) => T, deps: unknown[]) => T
    }
  }
}
