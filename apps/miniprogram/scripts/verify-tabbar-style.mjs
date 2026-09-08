import { readFile } from 'node:fs/promises'

const stylesheet = await readFile(new URL('../src/pages/main/main.scss', import.meta.url), 'utf8')

const requiredRules = [
  ['.tabbar', /\.tabbar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(5/],
  ['.tab-item', /\.tab-item\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/],
  ['.tab-icon', /\.tab-icon\s*\{[\s\S]*?display:\s*block/],
  ['.tab-label', /\.tab-label\s*\{[\s\S]*?display:\s*block/],
  ['.app-shell bottom spacing', /\.app-shell\s*\{[\s\S]*?padding-bottom:\s*196px/],
]

const failures = requiredRules
  .filter(([, pattern]) => !pattern.test(stylesheet))
  .map(([name]) => name)

if (failures.length > 0) {
  console.error(`Tabbar style regression: missing ${failures.join(', ')}`)
  process.exit(1)
}

console.log('Tabbar style check passed')
