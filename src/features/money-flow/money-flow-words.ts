import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  PALETTE_SIZE,
  type Basis,
  type FlowNode,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'

/** A palette slot's colour; past the eighth the hues repeat (drawn with a dashed outline). */
export function slotColor(slot: number | null): string {
  return slot === null ? 'var(--flow-pool)' : `var(--flow-${(slot % PALETTE_SIZE) + 1})`
}

/**
 * Category groups take the same eight hues from the fifth on, so that the first groups never
 * share a colour with the first accounts (a household seldom has more than four).
 */
export const GROUP_HUE_OFFSET = 4

export function groupColor(slot: number | null): string {
  return slotColor(slot === null ? null : (slot % PALETTE_SIZE) + GROUP_HUE_OFFSET)
}

export interface NodeText {
  name: string
  /** The figure with its word ("stays CHF 600.00, spendable", "spent … of …"). */
  figure: string
  /** Said in words beside the warning hatch (a shortfall, more out than in). */
  warning: string | null
}

/** What each node says: its name and its figure with its word, every figure from the read. */
export function useNodeText(flow: MoneyFlow, basis: Basis) {
  const { t } = useTranslation()
  const accounts = new Map(flow.accounts.map((account) => [account.id, account]))
  const groups = new Map(flow.spending.map((row) => [`group:${row.id}`, row]))
  const incomes = new Map(flow.incomes.map((income) => [`income:${income.id}`, income]))
  const total = flow.total
  const m = formatMoney
  return (node: FlowNode): NodeText => {
    switch (node.kind) {
      case 'income':
        return { name: node.name, figure: m(incomes.get(node.id)?.amount ?? 0), warning: null }
      case 'not_assigned':
        return {
          name: t('moneyFlow.notAssigned'),
          figure: t('moneyFlow.label.staysSpendable', { amount: m(flow.notAssigned?.stays ?? 0) }),
          warning: null,
        }
      case 'account': {
        const account = accounts.get(node.id)
        const amount = m(account?.stays ?? 0)
        if (account?.negative) {
          return {
            name: node.name,
            figure: t('moneyFlow.label.stays', { amount }),
            warning: t('moneyFlow.label.moreOut'),
          }
        }
        return {
          name: node.name,
          figure: account?.spendable
            ? t('moneyFlow.label.staysSpendable', { amount })
            : t('moneyFlow.label.staysSetAside', { amount }),
          warning: null,
        }
      }
      case 'spendable': {
        const rest = basis === 'planned' ? (total?.notPlanned ?? 0) : (total?.left ?? 0)
        return {
          name: t('moneyFlow.spendableName'),
          figure: t('moneyFlow.label.spendable', { amount: m(total?.spendable ?? 0) }),
          warning:
            rest < 0
              ? t(`moneyFlow.short.${basis}`, { amount: m(rest) })
              : (total?.spendable ?? 0) < 0
                ? t('moneyFlow.label.spendableNegative')
                : null,
        }
      }
      case 'set_aside':
        return {
          name: t('moneyFlow.setAsideName'),
          figure: t('moneyFlow.label.setAside', { amount: m(total?.setAside ?? 0) }),
          warning: null,
        }
      case 'spending': {
        const row = groups.get(node.id)
        if (!row) return { name: node.name, figure: '', warning: null }
        return {
          name: node.name,
          figure: spendingFigure(t, row, basis),
          warning: basis === 'actual' && row.negative ? t('moneyFlow.label.overPlan') : null,
        }
      }
      case 'rest':
        return basis === 'planned'
          ? {
              name: t('moneyFlow.notPlannedName'),
              figure: t('moneyFlow.label.notPlanned', { amount: m(total?.notPlanned ?? 0) }),
              warning: null,
            }
          : {
              name: t('moneyFlow.leftName'),
              figure: t('moneyFlow.label.left', { amount: m(total?.left ?? 0) }),
              warning: null,
            }
    }
  }
}

/** A group's figure on a basis, with its yearly amount and the share drawn as transfers. */
export function spendingFigure(
  t: TFunction,
  row: MoneyFlow['spending'][number],
  basis: Basis,
): string {
  const m = formatMoney
  const parts = [
    basis === 'planned'
      ? t('moneyFlow.label.planned', { amount: m(row.amount) })
      : t('moneyFlow.label.spent', { spent: m(row.spent), amount: m(row.amount) }),
  ]
  if (row.yearly !== null) parts.push(t('moneyFlow.label.yearly', { amount: m(row.yearly) }))
  // A share carried by transfers is drawn as transfers (set aside), never as spending here.
  if (row.transferShare !== 0) {
    parts.push(
      basis === 'planned'
        ? t('moneyFlow.label.viaTransfers', { amount: m(row.transferShare) })
        : t('moneyFlow.label.viaTransfersSpent', { amount: m(row.transferSpent) }),
    )
  }
  return parts.join(' · ')
}
