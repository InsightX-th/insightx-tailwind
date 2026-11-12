import { expect, it } from 'vitest'
import { loadDesignSystem } from './compiler'
import { sortClasses } from './sort'

it('sorts like Tailwind and keeps unknown classes first', async () => {
  const ds = await loadDesignSystem({})
  expect(sortClasses(ds, ['text-red-500', 'my-class', 'p-4', 'flex', 'hover:p-2'])).toEqual([
    'my-class',
    'flex',
    'p-4',
    'text-red-500',
    'hover:p-2',
  ])
})
