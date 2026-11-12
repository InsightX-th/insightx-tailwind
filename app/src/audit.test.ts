import { expect, it } from 'vitest'
import { classesInHtml, missingClasses } from './audit'
import { createCompiler, loadDesignSystem } from './compiler'

it('finds classes on the page that the cache lacks', async () => {
  const files = { 'main.css': '@import "tailwindcss/theme.css";\n@import "tailwindcss/utilities.css";\n@theme { --color-home-primary: #2563eb; }' }
  const cache = (await createCompiler(files)).build(['p-4', 'flex'])
  const html = `<footer class="p-4 flex  hover:text-home-primary my-footer"><a class='md:gap-6'>x</a></footer>`
  const classes = classesInHtml(html)
  expect([...classes]).toEqual(['p-4', 'flex', 'hover:text-home-primary', 'my-footer', 'md:gap-6'])
  const missing = await missingClasses(classes, files, await loadDesignSystem(files), cache)
  expect(missing).toEqual(['hover:text-home-primary', 'md:gap-6'])
})
