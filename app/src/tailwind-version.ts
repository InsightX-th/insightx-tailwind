/** npm's latest tag points at a stable release; compare its numeric version parts. */
export function isNewerTailwindVersion(current: string, latest: string): boolean {
  const stableVersion = /^\d+\.\d+\.\d+$/
  if (!stableVersion.test(current) || !stableVersion.test(latest)) return false
  const installed = current.split('.').map(Number)
  const available = latest.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (available[i]! > installed[i]!) return true
    if (available[i]! < installed[i]!) return false
  }
  return false
}
