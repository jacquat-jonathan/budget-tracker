import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  PALETTE_SIZE,
  type Basis,
  type FlowNode,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'

/** Roughly how wide a text is at a font size (px), a little generously: room, not a figure. */
export function textWidth(text: string, px: number): number {
  let em = 0
  for (const char of text) {
    if (/[0-9]/.test(char)) em += 0.6
    else if (/\s/.test(char)) em += 0.28
    else if (/['’.,:;·]/.test(char)) em += 0.27
    else if (/[A-ZÀ-Ý]/.test(char)) em += 0.68
    else if (/[mwMW]/.test(char)) em += 0.82
    else if (/[ijlft]/.test(char)) em += 0.3
    else em += 0.55
  }
  return em * px * 1.06
}

/** How many lines a text wraps to in a width: it breaks at plain spaces only. */
export function textLines(text: string, width: number, px: number): number {
  if (!text) return 0
  const space = textWidth(' ', px)
  let lines = 1
  let line = 0
  for (const word of text.split(' ')) {
    const size = textWidth(word, px)
    if (line > 0 && line + space + size > width) {
      lines += 1
      line = size
    } else {
      line += (line > 0 ? space : 0) + size
    }
  }
  return lines
}

/**
 * Names shortened to fit a width with an ellipsis, never two to the same text: where two
 * would read alike, both keep their end ("Joint acc…t A", "Joint acc…t B") or grow until
 * they differ. The full name is in the label's title and in the tables.
 */
export function shortNames(names: readonly string[], width: number, px: number): string[] {
  const fit = (name: string) => textWidth(name, px) <= width
  const cut = (name: string, keepEnd: number, extra: number) => {
    if (fit(name)) return name
    let head = name.length
    const tail = keepEnd > 0 ? name.slice(-keepEnd) : ''
    const make = () => `${name.slice(0, head).trimEnd()}…${tail}`
    while (head > 1 && textWidth(make(), px) > width + extra) head -= 1
    return make()
  }
  const out = names.map((name) => cut(name, 0, 0))
  for (let round = 0; round < 3; round += 1) {
    const seen = new Map<string, number[]>()
    out.forEach((text, index) => seen.set(text, [...(seen.get(text) ?? []), index]))
    const clashes = [...seen.values()].filter(
      (indices) => indices.length > 1 && new Set(indices.map((i) => names[i])).size > 1,
    )
    if (clashes.length === 0) break
    for (const indices of clashes) {
      for (const index of indices) {
        const name = names[index] ?? ''
        // Keep enough of the end to tell them apart; allow a little more width each round.
        const others = indices.filter((i) => i !== index).map((i) => names[i] ?? '')
        let keep = 1
        while (keep < name.length && others.some((other) => other.endsWith(name.slice(-keep))))
          keep += 1
        out[index] = cut(name, Math.min(name.length, keep + 1), round * 24)
      }
    }
  }
  return out
}

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
        // A shortfall is a sentence around the read's own figure (negative as it is given).
        const said = [
          (total?.spendable ?? 0) < 0 ? t('moneyFlow.label.spendableNegative') : null,
          rest < 0 ? t(`moneyFlow.short.${basis}`, { amount: m(rest) }) : null,
        ].filter((part): part is string => part !== null)
        return {
          name: t('moneyFlow.spendableName'),
          figure: t('moneyFlow.label.spendable', { amount: m(total?.spendable ?? 0) }),
          warning: said.length > 0 ? said.join(' ') : null,
        }
      }
      case 'set_aside':
        return {
          name: t('moneyFlow.setAsideName'),
          figure: t('moneyFlow.label.setAside', { amount: m(total?.setAside ?? 0) }),
          warning: (total?.setAside ?? 0) < 0 ? t('moneyFlow.label.setAsideNegative') : null,
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
