import i18n from '@/lib/i18n'

/**
 * Strings that only some pages use, loaded with those pages instead of with the first load:
 * the import (step 6), the comparison (step 5) and the subscriptions, debts and corrections
 * (step 4). A page's route waits for them before it renders, so no key ever shows.
 */
export type StringGroup = 'import' | 'compare' | 'step4'

export const ALL_GROUPS: readonly StringGroup[] = ['import', 'compare', 'step4']

interface Group {
  en: Record<string, unknown>
  fr: Record<string, unknown>
}

const loaders: Record<StringGroup, () => Promise<Group>> = {
  import: () => import('@/locales/groups/import'),
  compare: () => import('@/locales/groups/compare'),
  step4: () => import('@/locales/groups/step4'),
}

const loading = new Map<StringGroup, Promise<void>>()

/** Load these groups (each once) into both languages; resolves when they can be used. */
export function loadStrings(groups: readonly StringGroup[] = ALL_GROUPS): Promise<void> {
  return Promise.all(
    groups.map((group) => {
      let pending = loading.get(group)
      if (!pending) {
        pending = loaders[group]().then(({ en, fr }) => {
          i18n.addResourceBundle('en', 'translation', en, true, true)
          i18n.addResourceBundle('fr', 'translation', fr, true, true)
        })
        // A chunk that failed to load (offline) is asked again next time.
        pending.catch(() => loading.delete(group))
        loading.set(group, pending)
      }
      return pending
    }),
  ).then(() => undefined)
}
