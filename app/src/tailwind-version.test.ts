import { describe, expect, it } from 'vitest'
import { isNewerTailwindVersion } from './tailwind-version'

describe('Tailwind CSS update comparison', () => {
  it('detects newer patch, minor, and major releases', () => {
    expect(isNewerTailwindVersion('4.3.5', '4.3.6')).toBe(true)
    expect(isNewerTailwindVersion('4.3.5', '4.4.0')).toBe(true)
    expect(isNewerTailwindVersion('4.9.0', '4.10.0')).toBe(true)
    expect(isNewerTailwindVersion('4.3.5', '5.0.0')).toBe(true)
  })

  it('does not alert for the same, older, or invalid version', () => {
    expect(isNewerTailwindVersion('4.3.5', '4.3.5')).toBe(false)
    expect(isNewerTailwindVersion('4.3.5', '4.2.9')).toBe(false)
    expect(isNewerTailwindVersion('4.3.5', '4.3.6-beta.1')).toBe(false)
  })
})
