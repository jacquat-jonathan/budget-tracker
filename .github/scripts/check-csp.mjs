// Fails when the Content-Security-Policy in an .htaccess file would stop the browser from
// reaching the Supabase project: its REST/Auth API over https and Realtime over wss.
//
// Usage: node .github/scripts/check-csp.mjs <path/to/.htaccess> <supabase-url>
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
const match = htaccess.match(/^\s*Header\s+(?:always\s+)?set\s+Content-Security-Policy\s+"([^"]*)"/im)
if (!match) {
  fail(`No Content-Security-Policy header found in ${htaccessPath}.`)
}

const directives = new Map()
for (const part of match[1].split(';')) {
  const [name, ...sources] = part.trim().split(/\s+/)
  if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
}
const directiveName = directives.has('connect-src') ? 'connect-src' : 'default-src'
const sources = directives.get(directiveName) ?? []

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

const targets = [
  new URL(`https://${url.host}/`),
  new URL(`wss://${url.host}/`),
]
const blocked = targets.filter((t) => !sources.some((s) => sourceAllows(s, t)))

if (blocked.length > 0) {
  fail(
    `The Content-Security-Policy in public/.htaccess (${directiveName} ${sources.join(' ')}) ` +
      `blocks ${blocked.map((t) => t.origin.replace(/\/$/, '')).join(' and ')}, so the deployed ` +
      `app could not reach Supabase. Add them to connect-src (see docs/deployment.md) or fix ` +
      `VITE_SUPABASE_URL.`,
  )
}

console.log(`CSP ${directiveName} allows ${targets.map((t) => `${t.protocol}//${t.host}`).join(' and ')}.`)
