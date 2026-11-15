// Loading, checking and rendering of spec/spec.json. Plain Node (no build step), used by
// scripts/spec/check.mjs (npm run spec:check) and scripts/spec/render.mjs (npm run
// spec:render), and unit-tested in scripts/spec/spec-lib.test.mjs.
//
// Every function takes the repository root, so the tests can run it on a fixture.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'

export const PATHS = {
  spec: 'spec/spec.json',
  schema: 'spec/spec.schema.json',
  specDoc: 'docs/spec.md',
  claude: 'CLAUDE.md',
  packageJson: 'package.json',
  frLocale: 'src/locales/fr/translation.ts',
}

/** Where tests live, and which files in there are tests. */
export const TEST_ROOTS = [
  { dir: 'src', match: /\.(test|spec)\.[cm]?[jt]sx?$/, lang: 'js' },
  { dir: 'supabase/tests', match: /\.sql$/, lang: 'sql' },
]

export const CLAUDE_BEGIN =
  '<!-- BEGIN GENERATED: conventions from spec/spec.json. Do not edit by hand: change the spec, then run `npm run spec:render`. -->'
export const CLAUDE_END = '<!-- END GENERATED: conventions -->'

const RENDER_HINT = 'run `npm run spec:render` and commit the result'

// Ids a test may name: rules and conventions. A "malformed" id has the right shape but not
// exactly three digits (R-PERIOD-3, C-MONEY-0001).
const TESTABLE_ID = /\b[RC]-[A-Z][A-Z0-9]*-\d+\b/g
const WELL_FORMED_TESTABLE_ID = /^[RC]-[A-Z][A-Z0-9]*-\d{3}$/

// ---------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------

export class Report {
  constructor() {
    /** @type {{ code: string, subject: string, message: string, fix?: string }[]} */
    this.errors = []
    /** @type {{ code: string, subject: string, message: string, fix?: string }[]} */
    this.warnings = []
    /** @type {string[]} */
    this.info = []
  }

  error(code, subject, message, fix) {
    this.errors.push({ code, subject, message, fix })
  }

  warn(code, subject, message, fix) {
    this.warnings.push({ code, subject, message, fix })
  }

  get ok() {
    return this.errors.length === 0
  }
}

/** Human-readable report: what is wrong, where, and what to do about it. */
export function formatReport(report) {
  const lines = []
  for (const line of report.info) lines.push(line)
  const entry = (label, item) => {
    lines.push('')
    lines.push(`${label} [${item.code}] ${item.subject}: ${item.message}`)
    if (item.fix) lines.push(`      fix: ${item.fix}`)
  }
  for (const item of report.errors) entry('ERROR', item)
  for (const item of report.warnings) entry('WARN ', item)
  lines.push('')
  const counts = `${plural(report.errors.length, 'error')}, ${plural(report.warnings.length, 'warning')}`
  lines.push(report.ok ? `spec:check passed (${counts}).` : `spec:check FAILED (${counts}).`)
  return lines.join('\n')
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------------------
// Loading and schema
// ---------------------------------------------------------------------------------------

function readText(root, file) {
  return readFileSync(path.join(root, file), 'utf8')
}

/** Parse spec/spec.json; null (with an error in the report) when it cannot be read. */
export function loadSpec(root, report) {
  let text
  try {
    text = readText(root, PATHS.spec)
  } catch {
    report.error('missing-file', PATHS.spec, 'cannot be read.', 'restore spec/spec.json')
    return null
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    report.error('invalid-json', PATHS.spec, `is not valid JSON (${error.message}).`)
    return null
  }
}

/** Validate against spec/spec.schema.json. Returns false when the shape is wrong. */
export function validateSchema(root, spec, report) {
  const schema = JSON.parse(readText(root, PATHS.schema))
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  const validate = ajv.compile(schema)
  if (validate(spec)) return true
  for (const error of validate.errors ?? []) {
    const where = error.instancePath || '/'
    const label = describePointer(spec, error.instancePath)
    let params = ''
    if (error.keyword === 'enum') params = ` (${error.params.allowedValues.join(', ')})`
    if (error.keyword === 'additionalProperties' || error.keyword === 'unevaluatedProperties') {
      params = ` ("${error.params.additionalProperty ?? error.params.unevaluatedProperty}")`
    }
    report.error(
      'schema',
      `${PATHS.spec} ${where}${label}`,
      `${error.message}${params}.`,
      'make the entry match spec/spec.schema.json (id patterns: R-AREA-001, C-AREA-001, D-001, Q-001, US-FEATURE-001, F-NAME, A-NAME, G-TERM).',
    )
  }
  return false
}

// "/rules/3/status" -> " (R-PERIOD-004)" so a message names the entry, not only its index.
function describePointer(spec, pointer) {
  const parts = pointer.split('/').slice(1)
  let node = spec
  let id
  for (const part of parts) {
    if (node === null || typeof node !== 'object') break
    node = node[part]
    if (node && typeof node === 'object' && typeof node.id === 'string') id = node.id
  }
  return id ? ` (${id})` : ''
}

// ---------------------------------------------------------------------------------------
// Index of everything with an id
// ---------------------------------------------------------------------------------------

/** Map of id -> { kind, item, feature? } for every entry of the spec. */
export function indexSpec(spec) {
  const index = new Map()
  const add = (kind, item, extra = {}) => {
    const list = index.get(item.id) ?? []
    list.push({ kind, item, ...extra })
    index.set(item.id, list)
  }
  for (const item of spec.glossary) add('glossary term', item)
  for (const item of spec.actors) add('actor', item)
  for (const feature of spec.features) {
    add('feature', feature)
    for (const story of feature.userStories) add('user story', story, { feature })
  }
  for (const item of spec.rules) add('rule', item)
  for (const item of spec.conventions) add('convention', item)
  for (const item of spec.decisions) add('decision', item)
  for (const item of spec.openQuestions) add('open question', item)
  return index
}

/** Rules and conventions together: the statements tests and checks enforce. */
export function checkables(spec) {
  return [
    ...spec.rules.map((item) => ({ kind: 'rule', item })),
    ...spec.conventions.map((item) => ({ kind: 'convention', item })),
  ]
}

// ---------------------------------------------------------------------------------------
// Integrity: ids, areas, cross-references, status
// ---------------------------------------------------------------------------------------

export function checkIntegrity(root, spec, report) {
  const index = indexSpec(spec)
  const one = (id) => index.get(id)?.[0]

  for (const [id, entries] of index) {
    if (entries.length > 1) {
      report.error(
        'duplicate-id',
        id,
        `is used ${entries.length} times (${entries.map((e) => e.kind).join(', ')}).`,
        'give each entry its own id; never reuse or renumber an existing one, take the next free number instead.',
      )
    }
  }

  const areas = new Set()
  for (const area of spec.areas) {
    if (areas.has(area.id)) report.error('duplicate-area', area.id, 'is listed twice in "areas".')
    areas.add(area.id)
  }

  const steps = new Set(spec.buildSteps.map((step) => step.step))
  spec.buildSteps.forEach((step, i) => {
    if (step.step !== i + 1) {
      report.error(
        'build-steps',
        `build step ${step.step}`,
        'build steps must be numbered 1, 2, 3, ... in order.',
      )
    }
  })

  const sourceLabels = new Set(Object.keys(spec.meta.sources))
  const checkSources = (id, sources) => {
    for (const source of sources) {
      const label = source.split(':')[0].trim()
      if (!sourceLabels.has(label)) {
        report.error(
          'unknown-source',
          id,
          `source "${source}" does not start with a label from meta.sources (${[...sourceLabels].join(', ')}).`,
          'write the source as "<label>: <where>", or add the label to meta.sources.',
        )
      }
    }
  }

  const ref = (from, id, field, wantKinds) => {
    const target = one(id)
    if (!target) {
      report.error(
        'dangling-ref',
        from,
        `${field} names ${id}, which does not exist.`,
        `fix the id or add ${id} to the spec.`,
      )
      return null
    }
    if (wantKinds && !wantKinds.includes(target.kind)) {
      report.error(
        'wrong-ref',
        from,
        `${field} names ${id}, which is a ${target.kind}, not a ${wantKinds.join(' or ')}.`,
      )
      return null
    }
    return target
  }

  for (const term of spec.glossary) {
    for (const id of term.see ?? []) ref(term.id, id, 'see')
  }

  let frText = null
  try {
    frText = readText(root, PATHS.frLocale).toLowerCase()
  } catch {
    // No French locale in this tree (fixtures): nothing to compare with.
  }
  if (frText !== null) {
    for (const term of spec.glossary) {
      if (term.fr && !frText.includes(term.fr.toLowerCase())) {
        report.error(
          'glossary-fr',
          term.id,
          `French term "${term.fr}" does not appear in ${PATHS.frLocale}.`,
          'use the exact French UI wording from the locale file, or drop "fr" when the UI has no term for it.',
        )
      }
    }
  }

  for (const feature of spec.features) {
    if (!steps.has(feature.step)) {
      report.error('unknown-step', feature.id, `step ${feature.step} is not in buildSteps.`)
    }
    const suffix = feature.id.slice(2)
    for (const story of feature.userStories) {
      if (!story.id.startsWith(`US-${suffix}-`)) {
        report.error(
          'id-namespace',
          story.id,
          `a user story of ${feature.id} must be numbered US-${suffix}-NNN.`,
          'use the feature name as the middle part of the id.',
        )
      }
      ref(story.id, story.actor, 'actor', ['actor'])
      for (const id of story.rules) ref(story.id, id, 'rules', ['rule'])
    }
  }

  for (const { kind, item } of checkables(spec)) {
    const prefix = kind === 'rule' ? 'R' : 'C'
    if (!areas.has(item.area)) {
      report.error(
        'unknown-area',
        item.id,
        `area "${item.area}" is not listed in "areas".`,
        'add the area or use an existing one.',
      )
    }
    const expected = `${prefix}-${item.area.toUpperCase()}-`
    if (!item.id.startsWith(expected)) {
      report.error(
        'id-namespace',
        item.id,
        `the id of a ${kind} in area "${item.area}" must start with ${expected}.`,
        'ids are namespaced by kind and area; pick the next free number in the right namespace.',
      )
    }
    for (const id of item.related ?? []) ref(item.id, id, 'related')
    checkSources(item.id, item.source)

    if (item.testPending && !(item.status === 'active' && item.enforcement === 'test')) {
      report.error(
        'test-pending-misplaced',
        item.id,
        `has a testPending marker but is ${item.status} with enforcement "${item.enforcement}"; the marker only excuses an active rule enforced by test.`,
        'remove the testPending marker.',
      )
    }

    if (kind === 'rule') {
      const feature = ref(item.id, item.feature, 'feature', ['feature'])
      if (feature && item.status !== 'retired') {
        const expectedStatus = feature.item.status === 'planned' ? 'planned' : 'active'
        if (item.status !== expectedStatus) {
          report.error(
            'rule-status',
            item.id,
            `is ${item.status} but its feature ${item.feature} is ${feature.item.status}; a rule is active exactly when its feature is done or in progress.`,
            `set "status": "${expectedStatus}" (or attach the rule to the right feature).`,
          )
        }
      }
    }
  }

  for (const decision of spec.decisions) {
    checkSources(decision.id, decision.source)
    for (const id of decision.related ?? []) ref(decision.id, id, 'related')
    if (decision.supersededBy) {
      if (decision.supersededBy === decision.id) {
        report.error('supersede-self', decision.id, 'is superseded by itself.')
      } else {
        ref(decision.id, decision.supersededBy, 'supersededBy', ['decision'])
      }
    }
  }

  for (const question of spec.openQuestions) {
    checkSources(question.id, question.source)
    for (const id of question.related ?? []) ref(question.id, id, 'related')
    if (question.resolvedBy) ref(question.id, question.resolvedBy, 'resolvedBy', ['decision'])
  }
}

// ---------------------------------------------------------------------------------------
// Ids removed since the base commit
// ---------------------------------------------------------------------------------------

function trackedIds(spec) {
  const ids = []
  for (const feature of spec.features ?? []) {
    ids.push(feature.id)
    for (const story of feature.userStories ?? []) ids.push(story.id)
  }
  for (const key of ['rules', 'conventions', 'decisions', 'openQuestions']) {
    for (const item of spec[key] ?? []) ids.push(item.id)
  }
  return ids
}

/**
 * Ids are never deleted or renumbered. Compares with spec/spec.json at `baseRef` (HEAD by
 * default) when `root` is the top of a git work tree that has the file at that ref.
 */
export function checkRemovedIds(root, spec, report, baseRef = 'HEAD') {
  let baseText
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (path.resolve(top) !== path.resolve(root)) return
    baseText = execFileSync('git', ['-C', root, 'show', `${baseRef}:${PATHS.spec}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return
  }
  let base
  try {
    base = JSON.parse(baseText)
  } catch {
    return
  }
  const now = new Set(trackedIds(spec))
  for (const id of trackedIds(base)) {
    if (!now.has(id)) {
      report.error(
        'id-removed',
        id,
        `existed in ${PATHS.spec} at ${baseRef} and is gone. Ids are never deleted or renumbered.`,
        'restore it; mark a rule or convention "retired" (with retiredBecause), a decision "superseded", a question "resolved".',
      )
    }
  }
}

// ---------------------------------------------------------------------------------------
// Test references
// ---------------------------------------------------------------------------------------

function walk(dir, match, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, match, out)
    else if (match.test(entry.name)) out.push(full)
  }
  return out
}

function lineAt(text, offset) {
  let line = 1
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

// Skip a quoted string or template literal starting at `i` (its opening quote). Returns the
// index after the closing quote.
function skipQuoted(text, i) {
  const quote = text[i]
  let j = i + 1
  while (j < text.length) {
    const ch = text[j]
    if (ch === '\\') j += 2
    else if (ch === quote) return j + 1
    else j++
  }
  return j
}

// From an opening parenthesis at `i`, the index after its matching closing one.
function skipParens(text, i) {
  let depth = 0
  let j = i
  while (j < text.length) {
    const ch = text[j]
    if (ch === "'" || ch === '"' || ch === '`') {
      j = skipQuoted(text, j)
      continue
    }
    if (ch === '/' && text[j + 1] === '/') {
      const end = text.indexOf('\n', j)
      j = end === -1 ? text.length : end
      continue
    }
    if (ch === '/' && text[j + 1] === '*') {
      const end = text.indexOf('*/', j + 2)
      j = end === -1 ? text.length : end + 2
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return j + 1
    }
    j++
  }
  return j
}

function skipSpace(text, i) {
  let j = i
  while (j < text.length && /\s/.test(text[j])) j++
  return j
}

const TEST_CALL = /(?<![.\w$])(describe|suite|it|test)((?:\.[A-Za-z]+)*)\s*\(/g

/**
 * Titles of describe/it/test calls in a JS/TS test file, including `.each(...)('title')`.
 * A title is the string literal (quotes or backticks) passed first.
 */
export function extractJsTitles(text) {
  const titles = []
  TEST_CALL.lastIndex = 0
  let match
  while ((match = TEST_CALL.exec(text))) {
    const modifiers = match[2].split('.').filter(Boolean)
    let i = TEST_CALL.lastIndex
    if (modifiers.some((m) => ['each', 'for', 'runIf', 'skipIf'].includes(m))) {
      i = skipSpace(text, skipParens(text, i - 1))
      if (text[i] !== '(') continue
      i++
    }
    i = skipSpace(text, i)
    const quote = text[i]
    if (quote !== "'" && quote !== '"' && quote !== '`') continue
    const end = skipQuoted(text, i)
    titles.push({
      title: text.slice(i + 1, end - 1),
      line: lineAt(text, match.index),
      skipped: modifiers.includes('skip') || modifiers.includes('todo'),
    })
  }
  return titles
}

/**
 * String literals of a SQL (pgTAP) file, where test descriptions live. Comments and
 * dollar-quoted bodies are skipped, so an apostrophe in a comment cannot derail parsing.
 */
export function extractSqlLiterals(text) {
  const literals = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 64))
      if (tag) {
        const end = text.indexOf(tag[0], i + tag[0].length)
        i = end === -1 ? text.length : end + tag[0].length
      } else i++
    } else if (ch === "'") {
      let j = i + 1
      let value = ''
      while (j < text.length) {
        if (text[j] === "'" && text[j + 1] === "'") {
          value += "'"
          j += 2
        } else if (text[j] === "'") break
        else value += text[j++]
      }
      literals.push({ title: value, line: lineAt(text, i), skipped: false })
      i = j + 1
    } else i++
  }
  return literals
}

/** Every rule or convention id named by a test title, with where it was named. */
export function findTestReferences(root) {
  const refs = []
  for (const { dir, match, lang } of TEST_ROOTS) {
    for (const file of walk(path.join(root, dir), match)) {
      const text = readFileSync(file, 'utf8')
      const titles = lang === 'sql' ? extractSqlLiterals(text) : extractJsTitles(text)
      const rel = path.relative(root, file).split(path.sep).join('/')
      for (const { title, line, skipped } of titles) {
        for (const id of title.match(TESTABLE_ID) ?? []) {
          refs.push({ id, file: rel, line, title, skipped })
        }
      }
    }
  }
  return refs
}

export function checkTests(spec, refs, report) {
  const byId = new Map()
  for (const { item } of checkables(spec)) byId.set(item.id, item)

  const counted = new Map()
  for (const ref of refs) {
    const where = `${ref.file}:${ref.line}`
    if (!WELL_FORMED_TESTABLE_ID.test(ref.id)) {
      report.error(
        'malformed-id',
        where,
        `test title names "${ref.id}", which is not a valid id (three digits: R-AREA-001).`,
        'write the id exactly as in spec/spec.json.',
      )
      continue
    }
    const item = byId.get(ref.id)
    if (!item) {
      report.error(
        'unknown-id',
        where,
        `test title names ${ref.id}, which is not a rule or convention in spec/spec.json.`,
        'fix the id in the test title, or add the rule to the spec in the same change.',
      )
      continue
    }
    if (item.status !== 'active') {
      report.error(
        'inactive-id',
        where,
        `test title names ${ref.id}, which is ${item.status}, not active.`,
        item.status === 'planned'
          ? `the feature is not built yet: if it now is, set its feature's status (and the rule's) in spec/spec.json; otherwise remove the id from the test.`
          : 'remove the id from the test, or reactivate the rule.',
      )
      continue
    }
    if (ref.skipped) {
      report.warn(
        'skipped-test',
        where,
        `names ${ref.id} in a skipped or todo test, which proves nothing and is not counted.`,
      )
      continue
    }
    counted.set(ref.id, (counted.get(ref.id) ?? 0) + 1)
  }

  const pending = []
  for (const { kind, item } of checkables(spec)) {
    if (item.status !== 'active' || item.enforcement !== 'test') continue
    const count = counted.get(item.id) ?? 0
    if (item.testPending) {
      pending.push(item.id)
      if (count > 0) {
        report.warn(
          'test-pending-stale',
          item.id,
          `still has a testPending marker, but ${plural(count, 'test')} now name it.`,
          'remove the testPending marker from spec/spec.json.',
        )
      }
      continue
    }
    if (count === 0) {
      report.error(
        'no-test',
        item.id,
        `no test names this active ${kind} (enforcement "test"): "${item.statement}"`,
        `add "${item.id}" to the describe()/it() title of a test that proves it (src/**/*.test.ts[x], or the description of a pgTAP test in supabase/tests/), or set its enforcement to "review" in spec/spec.json if no test can prove it.`,
      )
    }
  }

  if (pending.length > 0) {
    report.warn(
      'test-pending',
      `${pending.length} active rules and conventions`,
      `are marked testPending (TEMPORARY): their tests are in supabase/tests and do not name their ids yet: ${pending.join(', ')}.`,
      'tag the pgTAP test descriptions with these ids, then remove each testPending marker from spec/spec.json.',
    )
  }
  return counted
}

// ---------------------------------------------------------------------------------------
// Lint-enforced statements: the named check must exist
// ---------------------------------------------------------------------------------------

/** Find whether `job` in a GitHub workflow has a step whose run or name is `step`. */
export function workflowHasStep(text, job, step) {
  let inJobs = false
  let current = null
  let jobFound = false
  let stepFound = false
  for (const line of text.split(/\r?\n/)) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true
      continue
    }
    if (inJobs && /^\S/.test(line) && !line.startsWith('#')) inJobs = false
    if (!inJobs) continue
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (jobMatch) {
      current = jobMatch[1]
      if (current === job) jobFound = true
      continue
    }
    if (current !== job) continue
    const stepMatch = /^\s+(?:-\s+)?(run|name):\s*(.*?)\s*$/.exec(line)
    if (stepMatch) {
      const value = stepMatch[2].replace(/^(['"])(.*)\1$/, '$2')
      if (value === step) stepFound = true
    }
  }
  return { jobFound, stepFound }
}

async function eslintRuleSeverity(root, name, file) {
  const { ESLint } = await import('eslint')
  const eslint = new ESLint({ cwd: root })
  const config = await eslint.calculateConfigForFile(path.join(root, file))
  const setting = config?.rules?.[name]
  const severity = Array.isArray(setting) ? setting[0] : setting
  return severity === 2 || severity === 'error'
    ? 'error'
    : severity === 1 || severity === 'warn'
      ? 'warn'
      : 'off'
}

export async function checkLintEnforcement(root, spec, report) {
  let scripts = {}
  try {
    scripts = JSON.parse(readText(root, PATHS.packageJson)).scripts ?? {}
  } catch {
    // Reported per check below.
  }
  for (const { kind, item } of checkables(spec)) {
    if (item.status !== 'active' || item.enforcement !== 'lint') continue
    for (const check of item.checks ?? []) {
      if (check.kind === 'npm-script') {
        if (!(check.name in scripts)) {
          report.error(
            'missing-check',
            item.id,
            `this ${kind} is enforced by the npm script "${check.name}", which ${PATHS.packageJson} does not define.`,
            `add "${check.name}" to the scripts of package.json, or name the check that really enforces it.`,
          )
        }
      } else if (check.kind === 'ci-step') {
        let text
        try {
          text = readText(root, check.workflow)
        } catch {
          report.error(
            'missing-check',
            item.id,
            `names the workflow ${check.workflow}, which does not exist.`,
            'fix the workflow path in spec/spec.json.',
          )
          continue
        }
        const { jobFound, stepFound } = workflowHasStep(text, check.job, check.step)
        if (!jobFound) {
          report.error(
            'missing-check',
            item.id,
            `names job "${check.job}" in ${check.workflow}, which has no such job.`,
            'fix the job name in spec/spec.json.',
          )
        } else if (!stepFound) {
          report.error(
            'missing-check',
            item.id,
            `is enforced by the CI step "${check.step}" in job "${check.job}" of ${check.workflow}, which has no step with that run command or name.`,
            `add "- run: ${check.step}" to that job, or name the step that really enforces it.`,
          )
        }
      } else if (check.kind === 'eslint-rule') {
        const file = check.file ?? 'src/main.tsx'
        let severity
        try {
          severity = await eslintRuleSeverity(root, check.name, file)
        } catch (error) {
          report.error(
            'missing-check',
            item.id,
            `could not resolve the ESLint configuration for ${file} (${error.message}).`,
          )
          continue
        }
        if (severity !== 'error') {
          report.error(
            'missing-check',
            item.id,
            `is enforced by the ESLint rule "${check.name}", which is ${severity === 'off' ? 'not enabled' : 'only a warning'} for ${file}.`,
            `enable "${check.name}" as "error" in eslint.config.js, or name the check that really enforces it.`,
          )
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------

function wrap(text, width, first, rest) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = first
  let empty = true
  for (const word of words) {
    if (!empty && line.length + 1 + word.length > width) {
      lines.push(line)
      line = rest + word
    } else {
      line += (empty ? '' : ' ') + word
    }
    empty = false
  }
  lines.push(line)
  return lines.join('\n')
}

const ENFORCEMENT_LABEL = { test: 'test', lint: 'lint', review: 'review' }

function checkLabel(check) {
  if (check.kind === 'npm-script') return `npm script \`${check.name}\``
  if (check.kind === 'eslint-rule') return `ESLint rule \`${check.name}\``
  return `CI step \`${check.step}\` (${check.workflow}, job ${check.job})`
}

function statusLine(item, kind) {
  const parts = [item.status, `enforced by ${ENFORCEMENT_LABEL[item.enforcement]}`]
  if (kind === 'rule') parts.push(item.feature)
  let line = `_${parts.join(' · ')}_`
  if (item.testPending) line += ` · **TEST PENDING** (${item.testPending.suite})`
  return line
}

function renderCheckable(item, kind) {
  const lines = [`- **${item.id}** ${item.statement}`, `  ${statusLine(item, kind)}`]
  if (item.rationale) lines.push(`  - Why: ${item.rationale}`)
  if (item.checks) lines.push(`  - Checked by: ${item.checks.map(checkLabel).join('; ')}`)
  if (item.retiredBecause) lines.push(`  - Retired: ${item.retiredBecause}`)
  if (item.related?.length) lines.push(`  - Related: ${item.related.join(', ')}`)
  lines.push(`  - Source: ${item.source.join('; ')}`)
  return lines.join('\n')
}

function stepStatus(features) {
  const statuses = new Set(features.map((f) => f.status))
  if (statuses.size === 1) return [...statuses][0]
  if (statuses.has('in-progress') || statuses.has('done')) return 'in-progress'
  return 'planned'
}

/** docs/spec.md: the readable view of the whole spec. */
export function renderSpecMarkdown(spec) {
  const actors = new Map(spec.actors.map((a) => [a.id, a]))
  const out = []
  const push = (...lines) => out.push(...lines)

  push(
    `# ${spec.meta.title}`,
    '',
    '<!-- Generated from spec/spec.json by `npm run spec:render`. Do not edit by hand. -->',
    '',
    '> Generated from [`spec/spec.json`](../spec/spec.json) by `npm run spec:render`; do not edit',
    '> this file. Change the spec, render, and run `npm run spec:check`.',
    '',
    spec.meta.product,
    '',
    '## Contents',
    '',
    '- [Build steps and features](#build-steps-and-features)',
    '- [Business rules](#business-rules)',
    '- [Conventions](#conventions)',
    '- [Decisions](#decisions)',
    '- [Open questions](#open-questions)',
    '- [Glossary](#glossary)',
    '- [Actors](#actors)',
    '- [How to read this](#how-to-read-this)',
    '',
  )

  const ruleCount = (status) => spec.rules.filter((r) => r.status === status).length
  const pendingCount = checkables(spec).filter(({ item }) => item.testPending).length
  push(
    `${spec.rules.length} rules (${ruleCount('active')} active, ${ruleCount('planned')} planned), ` +
      `${spec.conventions.length} conventions, ${spec.decisions.length} decisions, ` +
      `${spec.openQuestions.filter((q) => q.status === 'open').length} open questions. ` +
      `${pendingCount} rules and conventions are marked **TEST PENDING**.`,
    '',
  )

  push('## Build steps and features', '')
  for (const step of spec.buildSteps) {
    const features = spec.features.filter((f) => f.step === step.step)
    push(`### Step ${step.step}: ${step.title} (${stepStatus(features)})`, '')
    for (const feature of features) {
      push(`#### ${feature.id} ${feature.title} (${feature.status})`, '', feature.description, '')
      for (const story of feature.userStories) {
        const actor = actors.get(story.actor)?.name ?? story.actor
        const article = /^[aeiou]/i.test(actor) ? 'an' : 'a'
        push(
          `- **${story.id}** As ${article} ${actor}, I want ${story.iWant}, so that ${story.soThat}.`,
          `  Rules: ${story.rules.join(', ')}`,
        )
      }
      push('')
    }
  }

  push('## Business rules', '')
  for (const area of spec.areas) {
    const rules = spec.rules.filter((r) => r.area === area.id)
    if (rules.length === 0) continue
    push(`### ${area.title}`, '')
    for (const rule of rules) push(renderCheckable(rule, 'rule'))
    push('')
  }

  push('## Conventions', '')
  for (const area of spec.areas) {
    const conventions = spec.conventions.filter((c) => c.area === area.id)
    if (conventions.length === 0) continue
    push(`### ${area.title}`, '')
    for (const convention of conventions) push(renderCheckable(convention, 'convention'))
    push('')
  }

  push('## Decisions', '')
  for (const d of spec.decisions) {
    const status = d.status === 'superseded' ? `superseded by ${d.supersededBy}` : 'accepted'
    push(`### ${d.id} ${d.title} (${status})`, '', d.decision, '', `**Why:** ${d.why}`, '')
    if (d.rejected.length > 0) {
      push('**Rejected:**', '')
      for (const r of d.rejected) push(`- ${r}`)
      push('')
    } else {
      push('**Rejected:** none recorded.', '')
    }
    if (d.related?.length) push(`Related: ${d.related.join(', ')}`, '')
    push(`Source: ${d.source.join('; ')}`, '')
  }

  push('## Open questions', '')
  for (const q of spec.openQuestions) {
    const status = q.status === 'resolved' ? ` (resolved by ${q.resolvedBy})` : ''
    push(`- **${q.id}**${status} ${q.question}`, `  - Context: ${q.context}`)
    if (q.related?.length) push(`  - Related: ${q.related.join(', ')}`)
    push(`  - Source: ${q.source.join('; ')}`)
  }
  push('')

  push('## Glossary', '')
  for (const g of spec.glossary) {
    const fr = g.fr ? ` (French UI: _${g.fr}_)` : ''
    const see = g.see?.length ? ` See ${g.see.join(', ')}.` : ''
    push(`- **${g.term}**${fr}: ${g.definition}${see}`)
  }
  push('')

  push('## Actors', '')
  for (const a of spec.actors) push(`- **${a.name}** (${a.id}): ${a.description}`)
  push('')

  push(
    '## How to read this',
    '',
    '- Ids are stable and never renumbered: `R-<AREA>-NNN` business rules, `C-<AREA>-NNN`',
    '  conventions, `D-NNN` decisions, `Q-NNN` open questions, `F-<NAME>` features,',
    '  `US-<FEATURE>-NNN` user stories, `A-<NAME>` actors, `G-<TERM>` glossary terms.',
    '- A rule is _active_ when its feature is done or in progress, _planned_ otherwise.',
    '- Enforcement: _test_ means a test names the id in its description (grep the id to find',
    '  it); _lint_ means a named mechanical check (npm script, ESLint rule, CI step);',
    '  _review_ means it cannot be checked mechanically and reviewers check it.',
    '- **TEST PENDING** is a temporary marker: the proof is in `supabase/tests` but those',
    '  tests do not name the id yet. `npm run spec:check` reports these as warnings.',
    '- Sources:',
  )
  for (const [label, text] of Object.entries(spec.meta.sources)) push(`  - \`${label}\`: ${text}`)
  push('')
  return out.join('\n')
}

/** The generated block of CLAUDE.md: the conventions, between the markers. */
export function renderClaudeBlock(spec) {
  const lines = [CLAUDE_BEGIN]
  for (const c of spec.conventions) {
    if (c.status === 'retired') continue
    const tag = `(\`${c.id}\`, ${c.testPending ? 'test pending' : c.enforcement})`
    lines.push(wrap(`${c.statement} ${tag}`, 92, '- ', '  '))
  }
  lines.push(CLAUDE_END)
  return lines.join('\n')
}

/** CLAUDE.md with its generated block replaced. Throws when the markers are missing. */
export function applyClaudeBlock(claudeText, block) {
  const begin = claudeText.indexOf(CLAUDE_BEGIN)
  const end = claudeText.indexOf(CLAUDE_END)
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `${PATHS.claude} has no generated block: it needs the lines\n${CLAUDE_BEGIN}\n${CLAUDE_END}`,
    )
  }
  return claudeText.slice(0, begin) + block + claudeText.slice(end + CLAUDE_END.length)
}

export function checkGenerated(root, spec, report) {
  const expected = renderSpecMarkdown(spec)
  let actual = null
  try {
    actual = readText(root, PATHS.specDoc)
  } catch {
    report.error('stale-generated', PATHS.specDoc, 'does not exist.', RENDER_HINT)
  }
  if (actual !== null && actual !== expected) {
    const line = firstDifference(actual, expected)
    report.error(
      'stale-generated',
      PATHS.specDoc,
      `is out of date with ${PATHS.spec} (first difference at line ${line}). It is generated: never edit it by hand.`,
      RENDER_HINT,
    )
  }

  let claude
  try {
    claude = readText(root, PATHS.claude)
  } catch {
    report.error('stale-generated', PATHS.claude, 'does not exist.')
    return
  }
  let rendered
  try {
    rendered = applyClaudeBlock(claude, renderClaudeBlock(spec))
  } catch (error) {
    report.error(
      'stale-generated',
      PATHS.claude,
      error.message.split('\n')[0] + '.',
      `restore the lines ${CLAUDE_BEGIN} and ${CLAUDE_END} around the Rules list, then ${RENDER_HINT}`,
    )
    return
  }
  if (rendered !== claude) {
    report.error(
      'stale-generated',
      PATHS.claude,
      `its generated conventions block is out of date with ${PATHS.spec}. It is generated: never edit it by hand.`,
      RENDER_HINT,
    )
  }
}

function firstDifference(a, b) {
  const x = a.split('\n')
  const y = b.split('\n')
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return i + 1
  return 0
}

// ---------------------------------------------------------------------------------------
// Everything
// ---------------------------------------------------------------------------------------

/** Run every check. Returns the report; `report.ok` is false when anything must be fixed. */
export async function runCheck(root, { baseRef = 'HEAD' } = {}) {
  const report = new Report()
  const spec = loadSpec(root, report)
  if (!spec) return report
  if (!validateSchema(root, spec, report)) {
    report.info.push(
      `${PATHS.spec} does not match its schema; fix that first, the other checks need a valid file.`,
    )
    return report
  }
  checkIntegrity(root, spec, report)
  checkRemovedIds(root, spec, report, baseRef)
  const refs = findTestReferences(root)
  const counted = checkTests(spec, refs, report)
  await checkLintEnforcement(root, spec, report)
  checkGenerated(root, spec, report)

  const files = new Set(refs.map((r) => r.file))
  const proven = [...counted.keys()].length
  report.info.unshift(
    `spec:check: ${spec.rules.length} rules, ${spec.conventions.length} conventions, ` +
      `${spec.decisions.length} decisions, ${spec.openQuestions.length} open questions, ` +
      `${spec.features.reduce((n, f) => n + f.userStories.length, 0)} user stories. ` +
      `${refs.length} id references in ${files.size} test files prove ${proven} ids.`,
  )
  return report
}

/** Validate, then write docs/spec.md and the CLAUDE.md block. Returns the report. */
export function render(root, write) {
  const report = new Report()
  const spec = loadSpec(root, report)
  if (!spec || !validateSchema(root, spec, report)) return report
  write(PATHS.specDoc, renderSpecMarkdown(spec))
  const claude = readText(root, PATHS.claude)
  try {
    write(PATHS.claude, applyClaudeBlock(claude, renderClaudeBlock(spec)))
  } catch (error) {
    report.error('claude-markers', PATHS.claude, error.message)
  }
  return report
}
