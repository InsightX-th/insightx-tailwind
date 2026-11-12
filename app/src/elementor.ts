import { getClassList } from './classlist'

/**
 * Autocomplete for Elementor's "CSS Classes" control. A native <datalist>
 * only completes the whole value, so each option is the current value with
 * its last word replaced by a suggestion. Live preview is runtime.js inside
 * the Elementor preview iframe.
 */
const LIST_ID = 'insightx-tailwind-classes'
const SELECTOR = 'input[data-setting="_css_classes"], input[data-setting="css_classes"]'

const datalist = document.createElement('datalist')
datalist.id = LIST_ID
document.body.append(datalist)

function suggest(input: HTMLInputElement, classes: string[]) {
  const value = input.value
  const cut = value.lastIndexOf(' ') + 1
  const head = value.slice(0, cut)
  const word = value.slice(cut)
  if (word === '') {
    datalist.replaceChildren()
    return
  }
  const options = []
  for (const c of classes) {
    if (c.startsWith(word) && c !== word) {
      const o = document.createElement('option')
      o.value = head + c
      options.push(o)
      if (options.length >= 50) break
    }
  }
  datalist.replaceChildren(...options)
}

void getClassList().then((classes) => {
  document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.matches(SELECTOR)) suggest(e.target, classes)
  })
  const attach = () => {
    for (const input of document.querySelectorAll<HTMLInputElement>(SELECTOR)) input.setAttribute('list', LIST_ID)
  }
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true })
  attach()
})
