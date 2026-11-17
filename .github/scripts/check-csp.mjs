// Fails when the Content-Security-Policy in an .htaccess file would stop the browser from
// reaching the Supabase project: its REST/Auth API over https and Realtime over wss.
//
// Usage: node .github/scripts/check-csp.mjs <path/to/.htaccess> <supabase-url>
//
// Every Content-Security-Policy header directive in the file is checked (set, append, add,
// merge, setifempty; with or without "always"), and any one that blocks the project fails.
// Which of several would really be sent depends on Apache's section merging (<If>,
// <FilesMatch>, ...), and a browser enforcing several policies applies all of them, so
// checking all of them is the safe reading.
//
// Matching is deliberately strict (CSP Level 2 rules): an https source does not count for
// wss, so both must be allowed explicitly, as the shipped policy does.

import { readFileSync } from 'node:fs'

const [htaccessPath, supabaseUrl] = process.argv.slice(2)
if (!htaccessPath || !supabaseUrl) {
  console.error('Usage: check-csp.mjs <.htaccess> <supabase-url>')
  process.exit(2)
}

function fail(message) {
  console.log(`::error::${message}`)
  process.exit(1)
}

let url
try {
  url = new URL(supabaseUrl)
} catch {
  fail(`VITE_SUPABASE_URL is not a valid URL: "${supabaseUrl}".`)
}
if (url.protocol !== 'https:') {
  fail(`VITE_SUPABASE_URL must use https, got "${url.origin}".`)
}

const htaccess = readFileSync(htaccessPath, 'utf8')
const headerPattern =
  /^[ \t]*Header[ \t]+(?:always[ \t]+|onsuccess[ \t]+)?(?:set|append|add|merge|setifempty)[ \t]+Content-Security-Policy[ \t]+"([^"]*)"/gim
const policies = [...htaccess.matchAll(headerPattern)].map((m) => m[1])
if (policies.length === 0) {
  fail(`No Content-Security-Policy header found in ${htaccessPath}.`)
}

function connectSources(policy) {
  const directives = new Map()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
  }
  const directiveName = directives.has('connect-src') ? 'connect-src' : 'default-src'
  // No connect-src and no default-src: the policy does not restrict connections.
  const sources = directives.get(directiveName) ?? ['*', 'https:', 'wss:']
  return { directiveName, sources }
}

const defaultPorts = { 'https:': '443', 'wss:': '443' }

function sourceAllows(source, target) {
  const s = source.toLowerCase()
  if (s === `${target.protocol}`) return true // scheme source, e.g. "https:"
  if (s === '*') return target.protocol === 'https:'
  const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/(\*\.)?([^/:]+|\*)(?::(\d+|\*))?(\/.*)?$/)
  if (!m) return false
  const [, scheme, wildcard, host, port, path] = m
  if (`${scheme}:` !== target.protocol) return false
  if (host === '*') {
    // "https://*" matches any host
  } else if (wildcard) {
    if (!target.hostname.endsWith(`.${host}`)) return false
  } else if (target.hostname !== host) {
    return false
  }
  const targetPort = target.port || defaultPorts[target.protocol]
  if (port !== '*' && (port ?? defaultPorts[target.protocol]) !== targetPort) return false
  // A path-restricted source would block parts of the API (/rest/v1, /auth/v1, ...).
  if (path && path !== '/') return false
  return true
}

const targets = [new URL(`https://${url.host}/`), new URL(`wss://${url.host}/`)]
const describe = (t) => `${t.protocol}//${t.host}`

const failures = []
policies.forEach((policy, index) => {
  const { directiveName, sources } = connectSources(policy)
  const blocked = targets.filter((t) => !sources.some((s) => sourceAllows(s, t)))
  if (blocked.length > 0) {
    failures.push(
      `Content-Security-Policy header ${index + 1} of ${policies.length} in ${htaccessPath} ` +
        `(${directiveName} ${sources.join(' ')}) blocks ${blocked.map(describe).join(' and ')}`,
    )
  }
})

if (failures.length > 0) {
  fail(
    `${failures.join('; ')}. The deployed app could not reach Supabase. Allow them in ` +
      `connect-src in public/.htaccess (see docs/deployment.md) or fix VITE_SUPABASE_URL.`,
  )
}

console.log(
  `All ${policies.length} Content-Security-Policy header(s) allow ${targets.map(describe).join(' and ')}.`,
)
