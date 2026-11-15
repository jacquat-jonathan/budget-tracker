import {
  ArrowLeftRightIcon,
  CalendarRangeIcon,
  CreditCardIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  RepeatIcon,
  SettingsIcon,
  WalletIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'

import { paths } from '@/app/paths'

export type NavKey =
  | 'dashboard'
  | 'budget'
  | 'transactions'
  | 'subscriptions'
  | 'debts'
  | 'periods'
  | 'moneyFlow'
  | 'income'
  | 'settings'

export interface NavItem {
  key: NavKey
  path: string
  icon: LucideIcon
}

/** Main sidebar entries, in display order. */
export const mainNavItems: NavItem[] = [
  { key: 'dashboard', path: paths.dashboard, icon: LayoutDashboardIcon },
  { key: 'budget', path: paths.budget, icon: PiggyBankIcon },
  { key: 'transactions', path: paths.transactions, icon: ArrowLeftRightIcon },
  { key: 'subscriptions', path: paths.subscriptions, icon: RepeatIcon },
  { key: 'debts', path: paths.debts, icon: CreditCardIcon },
  { key: 'periods', path: paths.periods, icon: CalendarRangeIcon },
  { key: 'moneyFlow', path: paths.moneyFlow, icon: WorkflowIcon },
  { key: 'income', path: paths.income, icon: HandCoinsIcon },
]

/** Entries shown at the bottom of the sidebar, above the footer. */
export const secondaryNavItems: NavItem[] = [
  { key: 'settings', path: paths.settings, icon: SettingsIcon },
]

export const allNavItems: NavItem[] = [...mainNavItems, ...secondaryNavItems]

export const AppIcon = WalletIcon

/** Route handle carried by every app page; read by the breadcrumb and the tab title. */
export interface PageHandle {
  nav: NavKey
}
