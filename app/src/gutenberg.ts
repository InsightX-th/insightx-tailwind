import { getClassList, getDesignSystem } from './classlist'
import { buildCache } from './build'
import { createCompiler } from './compiler'
import { __, getConfig } from './config'
import { sortClasses } from './sort'
import { isWidgetsEditor } from './mirror'
import { registerPageCssPanel } from './page-css-panel'

/**
 * Block sidebar panel "Tailwind classes": token input bound to the block's
 * className with suggestions, a sort button and the generated CSS. Live
 * preview itself is runtime.js, which PHP enqueues inside the canvas iframe.
 */
const { hooks, element, compose, blockEditor, components, data } = window.wp
const h = element.createElement

async function cssFor(classes: string[]): Promise<string> {
  // Fresh compiler: build() accumulates candidates across calls.
  const css = (await createCompiler(getConfig().files)).build(classes)
  // Only the rules, not the theme variables / header comment.
  return css.replace(/^\/\*![^*]*\*\/\s*/, '').replace(/@layer theme\s*\{[\s\S]*?\n\}\n?/, '').trim()
}

const withTailwindPanel = compose.createHigherOrderComponent<BlockEditProps>(
  (BlockEdit) => (props) => {
    const [suggestions, setSuggestions] = element.useState<string[]>([])
    const [showCss, setShowCss] = element.useState(false)
    const [css, setCss] = element.useState('')
    const tokens = (props.attributes.className ?? '').split(/\s+/).filter(Boolean)
    const setTokens = (next: string[]) => {
      const className = next.join(' ')
      props.setAttributes({ className: className === '' ? undefined : className })
    }

    element.useEffect(() => {
      if (props.isSelected && suggestions.length === 0) void getClassList().then(setSuggestions)
    }, [props.isSelected])

    element.useEffect(() => {
      if (showCss && props.isSelected) void cssFor(tokens).then(setCss)
    }, [showCss, props.isSelected, props.attributes.className])

    if (!props.isSelected) return h(BlockEdit, props)

    const panel = h(
      blockEditor.InspectorControls,
      null,
      h(
        components.PanelBody,
        {
          title: h('span', { className: 'ixt-panel__title' }, __('Tailwind classes'), tokens.length > 0 ? h('span', { className: 'ixt-count' }, String(tokens.length)) : null),
          initialOpen: true,
          className: 'ixt-panel ixt-panel--classes',
        },
        h(components.FormTokenField, {
          label: __('Classes'),
          value: tokens,
          suggestions,
          maxSuggestions: 30,
          tokenizeOnSpace: true,
          __experimentalShowHowTo: false,
          placeholder: __('Type a class, e.g. p-4 or md:flex'),
          __next40pxDefaultSize: true,
          __nextHasNoMarginBottom: true,
          onChange: (next: (string | { value: string })[]) => setTokens(next.map((t) => (typeof t === 'string' ? t : t.value))),
        }),
        h(
          'div',
          { className: 'ixt-actions' },
          h(
            components.Button,
            {
              variant: 'secondary',
              size: 'compact',
              icon: 'sort',
              disabled: tokens.length < 2,
              onClick: () => void getDesignSystem().then((ds) => ds && setTokens(sortClasses(ds, tokens))),
            },
            __('Sort classes'),
          ),
          h(
            components.Button,
            { variant: 'tertiary', size: 'compact', icon: 'editor-code', disabled: tokens.length === 0, isPressed: showCss, onClick: () => setShowCss(!showCss) },
            showCss ? __('Hide CSS') : __('Show CSS'),
          ),
        ),
        showCss && tokens.length > 0 ? h('pre', { className: 'ixt-css-output' }, css || __('No CSS generated for these classes.')) : null,
      ),
    )

    // Panel first so it sits above the block's own controls (e.g. Element).
    return h(element.Fragment, null, panel, h(BlockEdit, props))
  },
  'withInsightxTailwindPanel',
)

hooks.addFilter('editor.BlockEdit', 'insightx-tailwind/panel', withTailwindPanel as never)
registerPageCssPanel()

// Rebuild the frontend cache after each manual save (admins only; others leave it stale for later).
// Only the post/page editor has the `core/editor` store and only the Widgets editor has
// `core/edit-widgets`; the site editor has neither, and a throwing listener there breaks
// the whole editor (blank screen).
function isSaving(): boolean {
  if (isWidgetsEditor()) return data.select('core/edit-widgets')?.isSavingWidgetAreas?.() === true
  const editor = data.select('core/editor')
  if (!editor || typeof editor.isSavingPost !== 'function') return false
  return editor.isSavingPost() && !editor.isAutosavingPost()
}

if (getConfig().canBuild) {
  let wasSaving = false
  let building = false
  data.subscribe(() => {
    try {
      const saving = isSaving()
      if (wasSaving && !saving && !building) {
        building = true
        buildCache()
          .catch((error: unknown) => console.error('[insightx-tailwind] build failed', error))
          .finally(() => (building = false))
      }
      wasSaving = saving
    } catch (error) {
      console.error('[insightx-tailwind]', error)
    }
  })
}
