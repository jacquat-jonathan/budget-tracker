import { en } from '@/locales/en/translation'
import { fr } from '@/locales/fr/translation'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? '').sort()
}

function valueAt(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], source)
}

describe('locales', () => {
  const enKeys = flattenKeys(en).sort()
  const frKeys = flattenKeys(fr).sort()

  it('have the same keys in English and French', () => {
    expect(frKeys.filter((key) => !enKeys.includes(key))).toEqual([])
    expect(enKeys.filter((key) => !frKeys.includes(key))).toEqual([])
  })

  it('have no empty strings', () => {
    for (const key of enKeys) {
      expect(valueAt(en, key), `en.${key}`).not.toBe('')
      expect(valueAt(fr, key), `fr.${key}`).not.toBe('')
    }
  })

  it('use the same interpolation placeholders in both languages', () => {
    for (const key of enKeys) {
      const enValue = valueAt(en, key)
      const frValue = valueAt(fr, key)
      if (typeof enValue === 'string' && typeof frValue === 'string') {
        expect(placeholders(frValue), key).toEqual(placeholders(enValue))
      }
    }
  })
})
