import type { DesignSystem } from './compiler'

/** Tailwind's canonical order (same as prettier-plugin-tailwindcss): unknown classes first, in their original order. */
export function sortClasses(ds: DesignSystem, classes: string[]): string[] {
  return ds
    .getClassOrder(classes)
    .map(([name, order], index) => ({ name, order, index }))
    .sort((a, b) => {
      if (a.order === b.order) return a.index - b.index
      if (a.order === null) return -1
      if (b.order === null) return 1
      return a.order < b.order ? -1 : 1
    })
    .map((x) => x.name)
}
