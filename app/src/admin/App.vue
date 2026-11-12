<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { DEFAULT_MAIN_CSS, ENTRY, createCompiler, importedFiles, loadDesignSystem, migrateWindpressMain, withPageFiles, type Files, type ThemeJsonMode } from '../compiler'
import { __, api, getConfig, type CacheInfo } from '../config'
import { buildCache } from '../build'
import { classesInHtml, missingClasses } from '../audit'
import CodeEditor from './CodeEditor.vue'
import Icon from './Icon.vue'
import tailwindPackage from 'tailwindcss/package.json'
import { isNewerTailwindVersion } from '../tailwind-version'

type View = 'files' | 'sources' | 'gutenberg' | 'build' | 'manual'
type Toast = { id: number; kind: 'ok' | 'error'; text: string }

const config = getConfig()
const bundledTailwindVersion = tailwindPackage.version
const latestTailwindVersion = ref<string | null>(null)
const tailwindUpdateAvailable = computed(() => latestTailwindVersion.value !== null
  && isNewerTailwindVersion(bundledTailwindVersion, latestTailwindVersion.value))
const files = ref<Files>({ [ENTRY]: DEFAULT_MAIN_CSS, ...config.files })
const savedFiles = ref<string>(JSON.stringify(files.value))
const current = ref<string>(ENTRY)
const enabledSources = ref<string[]>([...(config.enabledSources ?? [])])
const enabledPlugins = ref<string[]>([...(config.enabledPlugins ?? [])])
const themeJson = ref<ThemeJsonMode>(config.themeJson ?? 'custom')
const mirrorFrontend = ref(config.mirrorFrontend ?? true)
const cache = ref<CacheInfo | null>(config.cache ?? null)
const stale = ref(config.stale ?? false)
const view = ref<View>('files')
const busy = ref(false)
const log = ref<string[]>([])
const toasts = ref<Toast[]>([])
const creating = ref(false)
const newFile = ref('')
const newFileInput = ref<HTMLInputElement | null>(null)
const auditing = ref(false)
const auditProgress = ref('')
const auditResults = ref<{ url: string; title: string; missing: string[]; error?: string }[] | null>(null)

const fileNames = computed(() => [ENTRY, ...Object.keys(files.value).filter((n) => n !== ENTRY).sort()])
const globalSet = computed(() => importedFiles(files.value))
/** Pages each page-only file is attached to (from the last page load). */
const usedBy = computed(() => {
  const map: Record<string, string[]> = {}
  for (const page of Object.values(config.pageAssignments ?? {})) for (const f of page.files) (map[f] ??= []).push(page.title)
  return map
})
function fileScope(name: string): { label: string; title: string; kind: 'entry' | 'global' | 'page' | 'unused' } {
  if (name === ENTRY) return { label: __('entry'), title: '', kind: 'entry' }
  if (globalSet.value.has(name)) return { label: __('All pages'), title: __('Imported by main.css'), kind: 'global' }
  const pages = usedBy.value[name] ?? []
  return pages.length > 0
    ? { label: pages.length === 1 ? pages[0] ?? '' : __('%s pages', pages.length), title: pages.join(', '), kind: 'page' }
    : { label: __('Not used'), title: __('Not imported by main.css and not attached to any page'), kind: 'unused' }
}
const dirty = computed(() => JSON.stringify(files.value) !== savedFiles.value)
const nav = computed<{ id: View; label: string; icon: 'files' | 'scan' | 'blocks' | 'zap' | 'book' }[]>(() => [
  { id: 'files', label: __('CSS files'), icon: 'files' },
  { id: 'sources', label: __('Scan sources'), icon: 'scan' },
  { id: 'gutenberg', label: __('Gutenberg'), icon: 'blocks' },
  { id: 'build', label: __('Build & cache'), icon: 'zap' },
  { id: 'manual', label: __('User manual'), icon: 'book' },
])
const themeJsonModes = computed<{ id: ThemeJsonMode; title: string; desc: string }[]>(() => [
  { id: 'custom', title: __('Custom colors only'), desc: __('Colors and fonts you define in @theme, e.g. --color-brand.') },
  { id: 'all', title: __('All Tailwind colors'), desc: __('Also the full default palette (250+ swatches).') },
  { id: 'off', title: __('Off'), desc: __("Don't touch the theme's palette.") },
])
const auditProblems = computed(() => (auditResults.value ?? []).filter((r) => r.missing.length > 0 || r.error))

const fileContent = computed({
  get: () => files.value[current.value] ?? '',
  set: (value: string) => {
    files.value = { ...files.value, [current.value]: value }
  },
})

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const formatTime = (time: number) => new Date(time * 1000).toLocaleString()

let toastId = 0
function toast(kind: Toast['kind'], text: string) {
  const id = ++toastId
  toasts.value.push({ id, kind, text })
  if (kind === 'ok') setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), 4500)
}

async function startNewFile() {
  view.value = 'files'
  creating.value = true
  newFile.value = ''
  await nextTick()
  newFileInput.value?.focus()
}

function addFile() {
  let name = newFile.value.trim().toLowerCase()
  if (name === '') {
    creating.value = false
    return
  }
  if (!name.endsWith('.css')) name += '.css'
  if (!/^[a-z0-9][a-z0-9._-]{0,63}\.css$/.test(name)) {
    toast('error', __('Invalid file name: %s (use letters, numbers, dot, dash; must end with .css)', name))
    return
  }
  if (!(name in files.value)) {
    files.value = { ...files.value, [name]: `/* ${name} */\n` }
    // Import it from main.css so it's compiled right away.
    files.value[ENTRY] = `${files.value[ENTRY] ?? ''}\n@import "./${name}";\n`
  }
  current.value = name
  creating.value = false
}

function removeFile(name: string) {
  if (name === ENTRY || !window.confirm(__('Delete %s? Remember to remove its @import from main.css.', name))) return
  const next = { ...files.value }
  delete next[name]
  files.value = next
  current.value = ENTRY
}

async function importWindpress() {
  try {
    const res = await api<{ files: Files }>('windpress')
    const names = Object.keys(res.files)
    if (names.length === 0) {
      toast('error', __('No WindPress CSS files found in uploads/windpress/data/.'))
      return
    }
    if (!window.confirm(__('Import %s files from WindPress? Files with the same name will be replaced.', names.length))) return
    const imported: Files = { ...res.files }
    imported[ENTRY] = migrateWindpressMain(res.files[ENTRY] ?? '')
    files.value = { ...files.value, ...imported }
    current.value = ENTRY
    view.value = 'files'
    toast('ok', __('Imported %s files from WindPress. Check main.css, then click Save & Build.', names.length))
  } catch (e) {
    toast('error', errorText(e))
  }
}

async function save(): Promise<boolean> {
  try {
    // Fail fast on CSS the compiler can't handle instead of saving it.
    await createCompiler(files.value)
    await api('settings', {
      method: 'POST',
      body: JSON.stringify({
        files: files.value,
        sources: enabledSources.value,
        plugins: enabledPlugins.value,
        theme_json: themeJson.value,
        mirror_frontend: mirrorFrontend.value,
      }),
    })
    config.files = { ...files.value }
    config.enabledSources = [...enabledSources.value]
    config.enabledPlugins = [...enabledPlugins.value]
    config.themeJson = themeJson.value
    config.mirrorFrontend = mirrorFrontend.value
    savedFiles.value = JSON.stringify(files.value)
    return true
  } catch (e) {
    toast('error', errorText(e))
    return false
  }
}

async function saveAndBuild() {
  if (busy.value) return
  busy.value = true
  log.value = []
  try {
    if (!(await save())) return
    stale.value = true
    cache.value = await buildCache((line) => log.value.push(line))
    stale.value = false
    toast('ok', __('Saved and rebuilt. Visitors now get the new CSS.'))
  } catch (e) {
    toast('error', errorText(e))
  } finally {
    busy.value = false
  }
}

/** Fetch every published page and list classes its CSS (page bundle or global cache) doesn't cover. */
async function auditPages() {
  if (auditing.value || !cache.value) return
  auditing.value = true
  auditResults.value = []
  try {
    const pages = await api<{ url: string; title: string; css: string; files: string[] }[]>('pages')
    // One design system / CSS text / selector memo per distinct CSS bundle.
    const bundles = new Map<string, { files: Files; ds: Awaited<ReturnType<typeof loadDesignSystem>>; css: string; memo: Map<string, string | null> }>()
    for (const [i, page] of pages.entries()) {
      auditProgress.value = __('Checking page %s of %s…', i + 1, pages.length)
      try {
        let bundle = bundles.get(page.css)
        if (!bundle) {
          const bundleFiles = withPageFiles(config.files, page.files)
          const [ds, css] = await Promise.all([
            loadDesignSystem(bundleFiles),
            fetch(`${page.css}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()),
          ])
          bundle = { files: bundleFiles, ds, css, memo: new Map() }
          bundles.set(page.css, bundle)
        }
        const html = await fetch(page.url, { credentials: 'same-origin' }).then((r) => r.text())
        const missing = await missingClasses(classesInHtml(html), bundle.files, bundle.ds, bundle.css, bundle.memo)
        auditResults.value.push({ ...page, missing })
      } catch (e) {
        auditResults.value.push({ ...page, missing: [], error: errorText(e) })
      }
    }
  } catch (e) {
    toast('error', errorText(e))
  } finally {
    auditing.value = false
    auditProgress.value = ''
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void saveAndBuild()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void api<{ latest: string | null }>('tailwind-version')
    .then((result) => { latestTailwindVersion.value = result.latest })
    .catch(() => { /* Keep the plugin usable when the registry is unreachable. */ })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Content changed since the last build (flagged by PHP on save_post): rebuild right away.
if (stale.value && cache.value) void saveAndBuild()
</script>

<template>
  <div class="ixt-app">
    <!-- Column 1: navigation -->
    <aside class="ixt-nav">
      <div class="ixt-brand">
        <div class="ixt-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35C13.39 10.84 14.53 12 17 12c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C15.61 7.16 14.47 6 12 6Z" />
            <path d="M7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.31.74 1.91 1.35C8.39 16.84 9.53 18 12 18c2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.31-.74-1.91-1.35C10.61 13.16 9.47 12 7 12Z" />
          </svg>
        </div>
        <div class="ixt-brand-text">
          <strong>InsightX Tailwind</strong>
          <span>Tailwind CSS {{ bundledTailwindVersion }} · v{{ config.version }}</span>
        </div>
      </div>

      <nav class="ixt-menu" :aria-label="__('Tailwind')">
        <button
          v-for="item in nav"
          :key="item.id"
          type="button"
          class="ixt-menu-item"
          :class="{ 'is-active': view === item.id }"
          :aria-current="view === item.id ? 'page' : undefined"
          @click="view = item.id"
        >
          <Icon :name="item.icon" />
          <span>{{ item.label }}</span>
          <span v-if="item.id === 'files' && dirty" class="ixt-dot is-warn" :title="__('Unsaved changes')" />
          <span v-if="item.id === 'build' && (stale || !cache)" class="ixt-dot is-warn" :title="__('Needs rebuild')" />
        </button>
      </nav>

      <div v-if="tailwindUpdateAvailable" class="ixt-tailwind-update" role="status">
        <strong>{{ __('Tailwind CSS %s is available', latestTailwindVersion ?? '') }}</strong>
        <span>{{ __('This plugin includes Tailwind CSS %s. Update InsightX Tailwind when a compatible release is available.', bundledTailwindVersion) }}</span>
        <a href="https://github.com/tailwindlabs/tailwindcss/releases" target="_blank" rel="noopener noreferrer">{{ __('View Tailwind releases') }} <Icon name="external" /></a>
      </div>

      <div class="ixt-nav-foot">
        <div class="ixt-status" :class="{ 'is-warn': stale || !cache }">
          <span class="ixt-status-dot" />
          <div>
            <strong>{{ !cache ? __('Not built yet') : stale ? __('Needs rebuild') : __('Up to date') }}</strong>
            <span v-if="cache">{{ formatSize(cache.size) }} · {{ formatTime(cache.time) }}</span>
          </div>
        </div>
        <button type="button" class="ixt-btn ixt-btn-primary ixt-btn-block" :disabled="busy" @click="saveAndBuild">
          <span v-if="busy" class="ixt-spinner" aria-hidden="true" />
          <Icon v-else name="zap" />
          {{ busy ? __('Building…') : __('Save & Build') }}
        </button>
      </div>
    </aside>

    <!-- Files: explorer + editor -->
    <template v-if="view === 'files'">
      <section class="ixt-explorer" :aria-label="__('Files')">
        <header class="ixt-pane-head">
          <h2>{{ __('Files') }}</h2>
          <div class="ixt-pane-actions">
            <button type="button" class="ixt-icon-btn is-accent" :title="__('New file')" :aria-label="__('New file')" @click="startNewFile">
              <Icon name="plus" />
            </button>
            <button v-if="config.hasWindpress" type="button" class="ixt-icon-btn" :title="__('Import from WindPress')" :aria-label="__('Import from WindPress')" @click="importWindpress">
              <Icon name="import" />
            </button>
          </div>
        </header>
        <ul class="ixt-file-list">
          <li v-for="name in fileNames" :key="name">
            <button type="button" class="ixt-file" :class="{ 'is-active': current === name }" @click="current = name">
              <span class="ixt-file-icon" :class="{ 'is-entry': name === ENTRY }">{{ name === ENTRY ? 'TW' : 'css' }}</span>
              <span class="ixt-file-name">{{ name }}</span>
              <span v-if="name !== ENTRY" class="ixt-scope" :class="`is-${fileScope(name).kind}`" :title="fileScope(name).title">{{ fileScope(name).label }}</span>
            </button>
          </li>
          <li v-if="creating">
            <form class="ixt-file is-new" @submit.prevent="addFile">
              <span class="ixt-file-icon">css</span>
              <input
                ref="newFileInput"
                v-model="newFile"
                type="text"
                :placeholder="__('new-file.css')"
                :aria-label="__('New file name')"
                spellcheck="false"
                @blur="addFile"
                @keydown.esc="creating = false"
              />
            </form>
          </li>
        </ul>
      </section>

      <section class="ixt-editor-pane">
        <header class="ixt-pane-head ixt-editor-head">
          <div class="ixt-editor-title">
            <span class="ixt-file-icon" :class="{ 'is-entry': current === ENTRY }">{{ current === ENTRY ? 'TW' : 'css' }}</span>
            <strong>{{ current }}</strong>
            <span v-if="config.dataPath" class="ixt-path"><Icon name="lock" />{{ config.dataPath }}/{{ current }}</span>
          </div>
          <div class="ixt-pane-actions">
            <button v-if="current === ENTRY" type="button" class="ixt-icon-btn" :title="__('Reset to default')" :aria-label="__('Reset to default')" @click="fileContent = DEFAULT_MAIN_CSS">
              <Icon name="reset" />
            </button>
            <button v-else type="button" class="ixt-icon-btn is-danger" :title="__('Delete %s', current)" :aria-label="__('Delete %s', current)" @click="removeFile(current)">
              <Icon name="trash" />
            </button>
            <button type="button" class="ixt-icon-btn is-accent" :class="{ 'is-dirty': dirty }" :disabled="busy" :title="__('Save & Build') + ' (⌘S)'" :aria-label="__('Save & Build')" @click="saveAndBuild">
              <Icon name="save" />
            </button>
          </div>
        </header>
        <CodeEditor v-model="fileContent" class="ixt-editor-body" />
        <footer class="ixt-editor-foot">
          {{ __('Import other files with @import "./name.css". Utilities are unlayered by default so they beat the theme.') }}
        </footer>
      </section>
    </template>

    <!-- Other views -->
    <main v-else class="ixt-content" :class="{ 'ixt-manual': view === 'manual' }">
      <template v-if="view === 'manual'">
        <header class="ixt-page-head">
          <h1 class="ixt-manual-title">{{ __('User manual') }} <span v-if="config.version" class="ixt-version-badge">v{{ config.version }}</span></h1>
          <p>{{ __('InsightX Tailwind — Manage Tailwind CSS for your WordPress site and editor') }}</p>
        </header>
        <iframe class="ixt-manual-frame" :src="config.manualUrl" :title="__('User manual')" />
      </template>
      <!-- Scan sources -->
      <template v-else-if="view === 'sources'">
        <header class="ixt-page-head">
          <h1>{{ __('Scan sources') }}</h1>
          <p>{{ __('Build reads these sources and generates CSS only for classes it finds.') }}</p>
        </header>
        <div class="ixt-card">
          <label v-for="s in config.sources" :key="s.id" class="ixt-toggle">
            <input v-model="enabledSources" type="checkbox" class="ixt-switch" :value="s.id" />
            <span><strong>{{ s.label }}</strong></span>
          </label>
        </div>
        <div v-if="enabledSources.includes('plugins')" class="ixt-card">
          <h2 class="ixt-card-title">{{ __('Plugins to scan') }}</h2>
          <label v-for="p in config.plugins" :key="p.file" class="ixt-check">
            <input v-model="enabledPlugins" type="checkbox" :value="p.file" />
            {{ p.name }}
          </label>
        </div>
      </template>

      <!-- Gutenberg -->
      <template v-else-if="view === 'gutenberg'">
        <header class="ixt-page-head">
          <h1>{{ __('Gutenberg') }}</h1>
          <p>{{ __('In the block editor, select a block and use the "Tailwind classes" panel: autocomplete, sort, and the generated CSS.') }}</p>
        </header>
        <div class="ixt-card">
          <h2 class="ixt-card-title">{{ __('Editor preview') }}</h2>
          <label class="ixt-toggle">
            <input v-model="mirrorFrontend" type="checkbox" class="ixt-switch" />
            <span>
              <strong>{{ __('Use the frontend CSS in the editor') }}</strong>
              <small>{{ __("Loads the page's real theme CSS, fonts and Customizer settings into the editor instead of the theme's editor stylesheet, so blocks look the same as on the site.") }}</small>
            </span>
          </label>
        </div>
        <div class="ixt-card">
          <h2 class="ixt-card-title">{{ __('Color palette (theme.json)') }}</h2>
          <p class="ixt-muted">{{ __('Add Tailwind colors and fonts to the Gutenberg color and font pickers. Applied on the next build.') }}</p>
          <div class="ixt-options">
            <label v-for="m in themeJsonModes" :key="m.id" class="ixt-option" :class="{ 'is-active': themeJson === m.id }">
              <input v-model="themeJson" type="radio" name="ixt-theme-json" :value="m.id" />
              <span>
                <strong>{{ m.title }}</strong>
                <small>{{ m.desc }}</small>
              </span>
            </label>
          </div>
        </div>
      </template>

      <!-- Build & cache -->
      <template v-else>
        <header class="ixt-page-head">
          <h1>{{ __('Build & cache') }}</h1>
          <p>{{ __('Visitors get one static CSS file. Gutenberg saves rebuild it automatically.') }}</p>
        </header>
        <div class="ixt-stats">
          <div class="ixt-stat">
            <span>{{ __('Size') }}</span>
            <strong>{{ cache ? formatSize(cache.size) : '—' }}</strong>
          </div>
          <div class="ixt-stat">
            <span>{{ __('Last build') }}</span>
            <strong>{{ cache ? formatTime(cache.time) : '—' }}</strong>
          </div>
          <div class="ixt-stat">
            <span>{{ __('Status') }}</span>
            <strong :class="stale || !cache ? 'is-warn' : 'is-ok'">
              {{ !cache ? __('Not built yet') : stale ? __('Needs rebuild') : __('Up to date') }}
            </strong>
          </div>
        </div>
        <div class="ixt-card">
          <div class="ixt-card-row">
            <h2 class="ixt-card-title">{{ __('CSS cache') }}</h2>
            <a v-if="cache" :href="cache.url" target="_blank" rel="noopener" class="ixt-link">{{ __('Open cache.css') }} <Icon name="external" /></a>
          </div>
          <p v-if="!cache" class="ixt-warn">{{ __("Visitors won't get Tailwind CSS until you build.") }}</p>
          <pre v-if="log.length" class="ixt-log">{{ log.join('\n') }}</pre>
          <p v-else class="ixt-muted">{{ __('Click Save & Build to scan the site and regenerate the CSS.') }}</p>
        </div>
        <div class="ixt-card">
          <div class="ixt-card-row">
            <div>
              <h2 class="ixt-card-title">{{ __('Check pages') }}</h2>
              <p class="ixt-muted">{{ __('Opens every published page and lists Tailwind classes that are missing from the cache.') }}</p>
            </div>
            <button type="button" class="ixt-btn ixt-btn-ghost" :disabled="auditing || busy || !cache" @click="auditPages">
              {{ auditing ? auditProgress : __('Check pages') }}
            </button>
          </div>
          <template v-if="auditResults && !auditing">
            <p v-if="auditProblems.length === 0" class="ixt-ok"><Icon name="check" /> {{ __('All %s pages are covered. No missing classes.', auditResults.length) }}</p>
            <template v-else>
              <p class="ixt-warn">
                {{ __('%s of %s pages use classes the scanner missed. Find where they are stored, enable that source, then rebuild.', auditProblems.length, auditResults.length) }}
              </p>
              <div v-for="r in auditProblems" :key="r.url" class="ixt-audit-row">
                <a :href="r.url" target="_blank" rel="noopener">{{ r.title || r.url }}</a>
                <p v-if="r.error" class="ixt-audit-error">{{ r.error }}</p>
                <p v-else class="ixt-audit-classes"><code v-for="c in r.missing" :key="c">{{ c }}</code></p>
              </div>
            </template>
          </template>
        </div>
      </template>
    </main>

    <!-- Toasts -->
    <div class="ixt-toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" class="ixt-toast" :class="`is-${t.kind}`" role="status">
        <Icon :name="t.kind === 'ok' ? 'check' : 'alert'" />
        <span>{{ t.text }}</span>
        <button type="button" class="ixt-icon-btn" :aria-label="__('Dismiss')" @click="toasts = toasts.filter((x) => x.id !== t.id)">
          <Icon name="x" />
        </button>
      </div>
    </div>
  </div>
</template>
