// Unit tests for the spec checker, on small fixture repositories in a temporary directory.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CLAUDE_BEGIN,
  CLAUDE_END,
  extractJsTitles,
  extractSqlLiterals,
  renderClaudeBlock,
  renderSpecMarkdown,
  runCheck,
  workflowHasStep,
} from './spec-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const schema = readFileSync(path.join(repoRoot, 'spec/spec.schema.json'), 'utf8')

const workflow = `name: CI
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run spec:check
  database:
    steps:
      - name: Run pgTAP tests
        run: supabase test db
`

function baseSpec() {
  return {
    meta: { title: 'Fixture', product: 'A fixture.', sources: { domain: 'The fixture.' } },
    areas: [
      { id: 'money', title: 'Money' },
      { id: 'spec', title: 'Spec' },
    ],
    glossary: [{ id: 'G-RAPPEN', term: 'Rappen', definition: 'A hundredth of a franc.' }],
    actors: [{ id: 'A-USER', name: 'user', description: 'Someone.' }],
    buildSteps: [
      { step: 1, title: 'Scaffold' },
      { step: 2, title: 'Later' },
    ],
    features: [
      {
        id: 'F-SHELL',
        step: 1,
        title: 'Shell',
        status: 'done',
        description: 'Built.',
        userStories: [
          {
            id: 'US-SHELL-001',
            actor: 'A-USER',
            iWant: 'amounts in francs',
            soThat: 'I can read them',
            rules: ['R-MONEY-001'],
          },
        ],
      },
      {
        id: 'F-LATER',
        step: 2,
        title: 'Later',
        status: 'planned',
        description: 'Not yet.',
        userStories: [],
      },
    ],
    rules: [
      {
        id: 'R-MONEY-001',
        area: 'money',
        statement: 'Money is shown in francs.',
        feature: 'F-SHELL',
        status: 'active',
        enforcement: 'test',
        source: ['domain: Money'],
      },
      {
        id: 'R-MONEY-002',
        area: 'money',
        statement: 'Money will be imported.',
        feature: 'F-LATER',
        status: 'planned',
        enforcement: 'test',
        source: ['domain: Money'],
      },
    ],
    decisions: [
      {
        id: 'D-001',
        title: 'Integer rappen',
        decision: 'Amounts are integer rappen.',
        why: 'Exact arithmetic.',
        rejected: ['Floats.'],
        status: 'accepted',
        source: ['domain: Money'],
      },
    ],
    conventions: [
      {
        id: 'C-SPEC-001',
        area: 'spec',
        statement: 'The spec is checked.',
        status: 'active',
        enforcement: 'lint',
        checks: [
          { kind: 'npm-script', name: 'spec:check' },
          {
            kind: 'ci-step',
            workflow: '.github/workflows/ci.yml',
            job: 'frontend',
            step: 'npm run spec:check',
          },
        ],
        source: ['domain: Spec'],
      },
    ],
    openQuestions: [],
  }
}

const tempDirs = []

/** Write a consistent fixture repository (generated files up to date) and return its root. */
function fixture({
  spec = baseSpec(),
  tests = {},
  scripts = { 'spec:check': 'node check.mjs' },
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spec-check-'))
  tempDirs.push(root)
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  write('spec/spec.json', JSON.stringify(spec, null, 2))
  write('spec/spec.schema.json', schema)
  write('package.json', JSON.stringify({ scripts }))
  write('.github/workflows/ci.yml', workflow)
  write('docs/spec.md', renderSpecMarkdown(spec))
  write('CLAUDE.md', `# Fixture\n\n## Rules\n\n${renderClaudeBlock(spec)}\n\n## Checks\n`)
  const defaultTests = {
    'src/lib/money.test.ts': "describe('money [R-MONEY-001]', () => { it('works', () => {}) })\n",
  }
  for (const [file, content] of Object.entries({ ...defaultTests, ...tests })) {
    if (content !== null) write(file, content)
  }
  return root
}

function codes(items) {
  return items.map((item) => `${item.code} ${item.subject}`)
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('spec:check', () => {
  it('passes on a consistent repository', async () => {
    const report = await runCheck(fixture())
    expect(codes(report.errors)).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('fails when an active rule enforced by test has no test naming it', async () => {
    const report = await runCheck(fixture({ tests: { 'src/lib/money.test.ts': null } }))
    expect(codes(report.errors)).toEqual(['no-test R-MONEY-001'])
    expect(report.errors[0].message).toContain('Money is shown in francs.')
    expect(report.errors[0].fix).toContain('"R-MONEY-001"')
  })

  it('accepts the id in an it.each title or a pgTAP description', async () => {
    const tests = {
      'src/lib/money.test.ts': "it.each([1, 2])('formats %i [R-MONEY-001]', () => {})\n",
    }
    expect((await runCheck(fixture({ tests }))).ok).toBe(true)
    const sql = {
      'src/lib/money.test.ts': null,
      'supabase/tests/database/money.test.sql':
        "-- the owner's test\nselect is(1, 1, 'amounts are francs [R-MONEY-001]');\n",
    }
    expect((await runCheck(fixture({ tests: sql }))).ok).toBe(true)
  })

  it('does not count an id named only in a comment or a skipped test', async () => {
    const tests = {
      'src/lib/money.test.ts':
        "// proves R-MONEY-001\nit.skip('money [R-MONEY-001]', () => {})\nit('other', () => {})\n",
    }
    const report = await runCheck(fixture({ tests }))
    expect(codes(report.errors)).toEqual(['no-test R-MONEY-001'])
    expect(codes(report.warnings)).toEqual(['skipped-test src/lib/money.test.ts:2'])
  })

  it('fails when a test names an unknown id', async () => {
    const tests = {
      'src/lib/other.test.ts': "it('formats [R-MONEY-099]', () => {})\n",
    }
    const report = await runCheck(fixture({ tests }))
    expect(codes(report.errors)).toEqual(['unknown-id src/lib/other.test.ts:1'])
    expect(report.errors[0].message).toContain('R-MONEY-099')
  })

  it('fails when a test names a planned rule or a malformed id', async () => {
    const tests = {
      'src/lib/other.test.ts':
        "it('imports [R-MONEY-002]', () => {})\nit('typo [R-MONEY-1]', () => {})\n",
    }
    const report = await runCheck(fixture({ tests }))
    expect(codes(report.errors)).toEqual([
      'inactive-id src/lib/other.test.ts:1',
      'malformed-id src/lib/other.test.ts:2',
    ])
  })

  it('reports a test-pending marker as a counted warning instead of an error', async () => {
    const spec = baseSpec()
    spec.rules[0].testPending = { suite: 'supabase/tests', note: 'Tag the pgTAP test.' }
    const report = await runCheck(fixture({ spec, tests: { 'src/lib/money.test.ts': null } }))
    expect(report.ok).toBe(true)
    expect(codes(report.warnings)).toEqual(['test-pending 1 active rules and conventions'])
    expect(report.warnings[0].message).toContain('R-MONEY-001')
  })

  it('rejects a test-pending marker on a rule that is not active and test-enforced', async () => {
    const spec = baseSpec()
    spec.rules[1].testPending = { suite: 'supabase/tests', note: 'Tag the pgTAP test.' }
    const report = await runCheck(fixture({ spec }))
    expect(codes(report.errors)).toEqual(['test-pending-misplaced R-MONEY-002'])
  })

  it('fails when the generated spec view is stale', async () => {
    const root = fixture()
    const file = path.join(root, 'docs/spec.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('Money is shown in francs.', 'Edited.'))
    const report = await runCheck(root)
    expect(codes(report.errors)).toEqual(['stale-generated docs/spec.md'])
    expect(report.errors[0].fix).toContain('npm run spec:render')
  })

  it('fails when the spec changed but the CLAUDE.md block was not rendered', async () => {
    const root = fixture()
    const spec = baseSpec()
    spec.conventions[0].statement = 'The spec is checked on every change.'
    writeFileSync(path.join(root, 'spec/spec.json'), JSON.stringify(spec))
    writeFileSync(path.join(root, 'docs/spec.md'), renderSpecMarkdown(spec))
    const report = await runCheck(root)
    expect(codes(report.errors)).toEqual(['stale-generated CLAUDE.md'])
  })

  it('fails when the CLAUDE.md markers are missing', async () => {
    const root = fixture()
    writeFileSync(path.join(root, 'CLAUDE.md'), '# Fixture\n')
    const report = await runCheck(root)
    expect(codes(report.errors)).toEqual(['stale-generated CLAUDE.md'])
    expect(report.errors[0].fix).toContain(CLAUDE_BEGIN)
    expect(report.errors[0].fix).toContain(CLAUDE_END)
  })

  it('fails when a lint-enforced convention names a check that does not exist', async () => {
    const report = await runCheck(fixture({ scripts: {} }))
    expect(codes(report.errors)).toEqual(['missing-check C-SPEC-001'])
    const spec = baseSpec()
    spec.conventions[0].checks[1].job = 'database'
    expect(codes((await runCheck(fixture({ spec }))).errors)).toEqual(['missing-check C-SPEC-001'])
  })

  it('fails on a schema violation and names the entry', async () => {
    const spec = baseSpec()
    spec.rules[0].status = 'live'
    spec.rules[1].id = 'R-money-2'
    const report = await runCheck(fixture({ spec }))
    expect(report.ok).toBe(false)
    expect(report.errors.every((e) => e.code === 'schema')).toBe(true)
    expect(report.errors.some((e) => e.subject.includes('/rules/0/status (R-MONEY-001)'))).toBe(
      true,
    )
    expect(report.errors.some((e) => e.subject.includes('/rules/1/id'))).toBe(true)
  })

  it('fails on a duplicate id, a dangling reference and a wrong namespace', async () => {
    const spec = baseSpec()
    spec.decisions.push({ ...spec.decisions[0] })
    spec.features[0].userStories[0].rules.push('R-MONEY-404')
    spec.rules[0].area = 'spec'
    const report = await runCheck(fixture({ spec }))
    expect(codes(report.errors)).toEqual(
      expect.arrayContaining([
        'duplicate-id D-001',
        'dangling-ref US-SHELL-001',
        'id-namespace R-MONEY-001',
      ]),
    )
  })

  it('fails when a rule status disagrees with its feature', async () => {
    const spec = baseSpec()
    spec.rules[1].status = 'active'
    const report = await runCheck(fixture({ spec }))
    expect(codes(report.errors)).toContain('rule-status R-MONEY-002')
  })

  it('checks ESLint rules against the resolved configuration', { timeout: 30_000 }, async () => {
    const spec = JSON.parse(readFileSync(path.join(repoRoot, 'spec/spec.json'), 'utf8'))
    spec.conventions[0].enforcement = 'lint'
    spec.conventions[0].checks = [
      { kind: 'eslint-rule', name: '@typescript-eslint/no-floating-promises' },
      { kind: 'eslint-rule', name: 'no-such-plugin/no-such-rule' },
    ]
    delete spec.conventions[0].testPending
    const { checkLintEnforcement, Report } = await import('./spec-lib.mjs')
    const report = new Report()
    await checkLintEnforcement(repoRoot, spec, report)
    expect(codes(report.errors)).toEqual([`missing-check ${spec.conventions[0].id}`])
    expect(report.errors[0].message).toContain('no-such-plugin/no-such-rule')
  })
})

describe('test title extraction', () => {
  it('reads describe/it/test titles, with modifiers and each tables', () => {
    const text = [
      "describe('a [R-X-001]', () => {",
      '  it.only("b", () => {})',
      '  test.each([[1, 2]])(`c %i`, () => {})',
      "  it.todo('d')",
      "  submit('not a test')",
      "  foo.it('not a test either')",
      '})',
    ].join('\n')
    expect(extractJsTitles(text)).toEqual([
      { title: 'a [R-X-001]', line: 1, skipped: false },
      { title: 'b', line: 2, skipped: false },
      { title: 'c %i', line: 3, skipped: false },
      { title: 'd', line: 4, skipped: true },
    ])
  })

  it('reads SQL string literals, skipping comments and dollar-quoted bodies', () => {
    const text =
      "-- it's a comment\nselect throws_ok($$select 'x'$$, 'P0001', 'it''s [R-A-001]');\n"
    expect(extractSqlLiterals(text).map((l) => l.title)).toEqual(['P0001', "it's [R-A-001]"])
  })

  it('finds a step in the named job only', () => {
    expect(workflowHasStep(workflow, 'frontend', 'npm run spec:check')).toEqual({
      jobFound: true,
      stepFound: true,
    })
    expect(workflowHasStep(workflow, 'database', 'npm run spec:check')).toEqual({
      jobFound: true,
      stepFound: false,
    })
    expect(workflowHasStep(workflow, 'database', 'Run pgTAP tests').stepFound).toBe(true)
    expect(workflowHasStep(workflow, 'deploy', 'x').jobFound).toBe(false)
  })
})
