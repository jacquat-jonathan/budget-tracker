// npm run spec:render: writes docs/spec.md and the generated conventions block of CLAUDE.md
// from spec/spec.json. Never edit those by hand.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatReport, render } from './spec-lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const report = render(root, (file, content) => {
  writeFileSync(path.join(root, file), content)
  console.log(`wrote ${file}`)
})
if (!report.ok) {
  console.log(formatReport(report))
  process.exit(1)
}
