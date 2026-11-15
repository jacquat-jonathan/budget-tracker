// npm run spec:check: fails when spec/spec.json is invalid, when a test-enforced rule has
// no test naming its id (or a test names an unknown or inactive id), when a lint-enforced
// rule names a check that does not exist, or when the generated views are stale.
//
// Usage: node scripts/spec/check.mjs [--base <git-ref>]
//   --base   ref to compare ids with, to catch a removed id (default: HEAD, or SPEC_BASE_REF)

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatReport, runCheck } from './spec-lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const baseIndex = args.indexOf('--base')
const baseRef = baseIndex !== -1 ? args[baseIndex + 1] : (process.env.SPEC_BASE_REF ?? 'HEAD')

const report = await runCheck(root, { baseRef })
console.log(formatReport(report))
process.exit(report.ok ? 0 : 1)
