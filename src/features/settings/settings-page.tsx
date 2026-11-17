import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/states'
import { ImportTokensSettings } from '@/features/import/settings/import-tokens'
import {
  MerchantRulesSettings,
  RememberedChoicesSettings,
} from '@/features/import/settings/merchant-rules'
import { AccountSettings } from '@/features/settings/account-settings'
import { BudgetSettings } from '@/features/settings/budget-settings'
import { MembersSettings } from '@/features/settings/members-settings'
import { PasswordSettings } from '@/features/settings/password-settings'

const SECTIONS = ['budget', 'members', 'import', 'account'] as const
type Section = (typeof SECTIONS)[number]

const sectionId = (section: Section) => `settings-${section}`

/**
 * Settings in four sections, each with its heading, and a list of links to them at the top:
 * the current budget, its members, the import (tokens and what it remembers), and my own
 * account (display name, password).
 */
// R-APP-533: settings in named sections with links to each.
export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('nav.settings')} description={t('pages.settings.description')} />
      <nav aria-label={t('settings.sections.label')} data-testid="settings-nav">
        <ul className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {SECTIONS.map((section) => (
            <li key={section}>
              <a
                href={`#${sectionId(section)}`}
                className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {t(`settings.sections.${section}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <SettingsSection section="budget">
        <BudgetSettings />
      </SettingsSection>
      <SettingsSection section="members">
        <MembersSettings />
      </SettingsSection>
      <SettingsSection section="import" description={t('settings.sections.importHelp')}>
        <ImportTokensSettings />
        <MerchantRulesSettings />
        <RememberedChoicesSettings />
      </SettingsSection>
      <SettingsSection section="account" description={t('settings.sections.accountHelp')}>
        <AccountSettings />
        <PasswordSettings />
      </SettingsSection>
    </div>
  )
}

/**
 * One section. A section of several cards gets its own heading (level 2, the cards' level 3);
 * a section of one card is headed by that card's own title.
 */
function SettingsSection({
  section,
  description,
  children,
}: {
  section: Section
  description?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const id = sectionId(section)
  const grouped = description !== undefined
  return (
    <section
      id={id}
      aria-labelledby={grouped ? `${id}-title` : undefined}
      className="flex scroll-mt-20 flex-col gap-4"
      data-testid={id}
    >
      {grouped && (
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {t(`settings.sections.${section}`)}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}
      {children}
    </section>
  )
}
