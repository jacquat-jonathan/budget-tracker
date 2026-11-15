import { z } from 'zod'

import '@/lib/zod-config'
import htaccess from '../../public/.htaccess?raw'
import indexHtml from '../../index.html?raw'

/** Every Content-Security-Policy value that public/.htaccess sets. */
function policies(): string[] {
  const header =
    /^\s*Header\s+(?:always\s+)?(?:set|append|add|merge|setifempty)\s+Content-Security-Policy\s+"([^"]*)"/gim
  return [...htaccess.matchAll(header)].map((match) => match[1] ?? '')
}

function directive(policy: string, name: string): string[] | undefined {
  const entry = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
  return entry?.slice(1)
}

describe('production Content-Security-Policy [C-CSP-001]', () => {
  it("allows scripts from 'self' only, in every policy the server sends", () => {
    expect(policies().length).toBeGreaterThan(0)
    for (const policy of policies()) {
      expect(directive(policy, 'script-src')).toEqual(["'self'"])
    }
  })

  it('needs no eval: Zod is configured jitless', () => {
    expect(z.config().jitless).toBe(true)
  })
})

describe('index.html [C-CSP-002]', () => {
  it('has no inline scripts and no inline event handlers', () => {
    const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [, attributes = '', body = ''] of scripts) {
      expect(attributes).toMatch(/\bsrc=/)
      expect(body.trim()).toBe('')
    }
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i)
    expect(indexHtml).not.toMatch(/javascript:/i)
  })
})
