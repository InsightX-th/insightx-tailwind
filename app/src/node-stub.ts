// Browser stand-in for node:fs / node:url (aliased in vite.config.ts).
// @iconify/tailwind4's file loader imports them, but we always hand it icon data, so they never run.
const unavailable = (): never => {
  throw new Error('insightx-tailwind: file access is not available in the browser')
}
export const readFileSync = unavailable
export const fileURLToPath = unavailable
