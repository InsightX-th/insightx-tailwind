import type { Files, ThemeJsonMode } from './compiler'

export interface SourceOption {
  id: string
  label: string
}

export interface PluginOption {
  file: string
  name: string
}

export interface CacheInfo {
  url: string
  time: number
  size: number
}

/** Shape of `window.insightxTailwind`, printed by PHP (`src/Assets.php`). */
export interface InsightxTailwindConfig {
  files: Files
  restUrl: string
  nonce: string
  canBuild?: boolean
  sources?: SourceOption[]
  enabledSources?: string[]
  plugins?: PluginOption[]
  enabledPlugins?: string[]
  themeJson?: ThemeJsonMode
  /** Block editor canvas: load the frontend's CSS instead of the theme's editor stylesheet. */
  mirrorFrontend?: boolean
  frontUrl?: string
  themeUrls?: string[]
  /** Page CSS files attached to the post being edited. */
  pageFiles?: string[]
  /** Volume files that can be attached per page (not imported by main.css). */
  pageFileOptions?: string[]
  globalFiles?: string[]
  pageAssignments?: Record<string, { title: string; files: string[] }>
  stale?: boolean
  cache?: CacheInfo | null
  hasWindpress?: boolean
  version?: string
  /** Volume folder relative to the WordPress root, for display. */
  dataPath?: string
  manualUrl?: string
  /** English source string => translation (built with __() in PHP). */
  i18n?: Record<string, string>
}

declare global {
  interface Window {
    insightxTailwind?: InsightxTailwindConfig
  }
}

export function getConfig(): InsightxTailwindConfig {
  const config = window.insightxTailwind ?? window.parent?.insightxTailwind
  if (!config) throw new Error('insightx-tailwind: window.insightxTailwind is missing')
  return config
}

/** Translate an English UI string; `%s` placeholders are filled in order. */
export function __(text: string, ...args: (string | number)[]): string {
  let out = getConfig().i18n?.[text] ?? text
  for (const a of args) out = out.replace('%s', String(a))
  return out
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { restUrl, nonce } = getConfig()
  const res = await fetch(restUrl + path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce, ...init.headers },
  })
  const body: unknown = await res.json()
  if (!res.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : res.statusText
    throw new Error(message)
  }
  return body as T
}
