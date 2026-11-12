import { loadDesignSystem, type DesignSystem } from './compiler'
import { getConfig } from './config'

let cached: Promise<DesignSystem | null> | null = null

export function getDesignSystem(): Promise<DesignSystem | null> {
  cached ??= loadDesignSystem(getConfig().files).catch((error: unknown) => {
    console.error('[insightx-tailwind]', error)
    return null
  })
  return cached
}

/** Every utility class the current CSS knows about (for autocomplete). */
export async function getClassList(): Promise<string[]> {
  const ds = await getDesignSystem()
  return ds ? ds.getClassList().map(([name]) => name) : []
}
