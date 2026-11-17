import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'

import { routes } from '@/app/routes'
import { categoriesDb, householdDb, incomeRow } from '@/test/budget-fixtures'
import { rpcError, type MockDb } from '@/test/mock-db'
import { accountRow, previewRow, transferRow } from '@/test/mock-transfers'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(async () => {
  await warmPages('transfers', 'accounts', 'periods', 'income')
}, 10_000)

type Mode = 'ok' | 'wait' | 'refuse' | 'fail'

interface FormCase {
  name: string
  db: () => MockDb
  path: string
  /** Opens the form and gives it arguments to preview; returns the dialog. */
  open: () => Promise<HTMLElement>
  preview: keyof MockDb['rpc']
  /** The preview's answer when it is shown (the mock's own when absent). */
  ok?: (args: Record<string, unknown>) => unknown
  write: keyof MockDb['rpc']
  save: string
  /** A text field Enter is pressed in (a confirmation without one: Enter wherever focus is). */
  field?: (dialog: HTMLElement) => HTMLElement
  /** Types ahead of the preview: the arguments change and the preview is not asked yet. */
  typeAhead?: (dialog: HTMLElement) => Promise<void>
}

const CURRENT = 'the period 23.10.2026 – 24.11.2026'

async function choose(dialog: HTMLElement, label: string, option: string) {
  await userEvent.click(within(dialog).getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function retype(field: HTMLElement, value: string) {
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

function transfersDb() {
  return categoriesDb({
    income_overview: [incomeRow()],
    account_overview: [
      accountRow(),
      accountRow({ id: 'acc-savings', name: 'Savings', kind: 'savings' }),
    ],
    transfer_overview: [transferRow()],
  })
}

async function transferAction(action: string, role: 'dialog' | 'alertdialog') {
  await userEvent.click(await screen.findByRole('button', { name: 'Actions for Savings' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
  return screen.findByRole(role)
}

async function periodAction(action: string) {
  const [row] = await screen.findAllByTestId('period-row')
  await userEvent.click(within(row!).getByRole('button', { name: `Actions for ${CURRENT}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
  return screen.findByRole('dialog')
}

const moveAccepted = {
  period_id: 'period-2',
  scheduled_start: '2026-10-23',
  accepted: true,
  refusal: null,
  interest_removed: 0,
  transfer_transactions_removed: 0,
  transfer_transactions_created: 0,
  transfer_marks_unplanned: 0,
}

const FORMS: FormCase[] = [
  {
    name: 'create a transfer',
    db: transfersDb,
    path: '/transfers?view=planned',
    open: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Plan a transfer' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Joint account')
      await choose(dialog, 'From', 'Salary account')
      await choose(dialog, 'To', 'Savings')
      await userEvent.type(within(dialog).getByLabelText('Amount each time'), '1500')
      return dialog
    },
    preview: 'preview_create_transfer',
    ok: () => [previewRow()],
    write: 'create_transfer',
    save: 'Save',
    field: (dialog) => within(dialog).getByLabelText('Name'),
    typeAhead: (dialog) => retype(within(dialog).getByLabelText('Amount each time'), '1300'),
  },
  {
    name: 'edit a transfer',
    db: transfersDb,
    path: '/transfers?view=planned',
    open: async () => {
      const dialog = await transferAction('Edit', 'dialog')
      await retype(within(dialog).getByLabelText('Amount each time'), '1200')
      return dialog
    },
    preview: 'preview_update_transfer',
    ok: (args) => [previewRow({ amount: typeof args.p_amount === 'number' ? args.p_amount : 0 })],
    write: 'update_transfer',
    save: 'Save',
    field: (dialog) => within(dialog).getByLabelText('Name'),
    typeAhead: (dialog) => retype(within(dialog).getByLabelText('Amount each time'), '1300'),
  },
  {
    name: 'end a transfer',
    db: transfersDb,
    path: '/transfers?view=planned',
    open: () => transferAction('End transfer', 'alertdialog'),
    preview: 'preview_end_transfer',
    ok: () => [
      {
        outcome: 'ended',
        refusal: null,
        occurrences_removed: 0,
        marks_kept: 0,
        transactions_kept: 0,
      },
    ],
    write: 'end_transfer',
    save: 'End transfer',
  },
  {
    name: 'close an account',
    db: () =>
      categoriesDb({
        account_overview: [
          accountRow(),
          accountRow({ id: 'acc-savings', name: 'Savings', kind: 'savings' }),
        ],
      }),
    path: '/accounts',
    open: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Actions for Savings' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Close account' }))
      return screen.findByRole('alertdialog')
    },
    preview: 'preview_close_account',
    write: 'close_account',
    save: 'Close account',
  },
  {
    name: 'reopen the previous period',
    db: () => householdDb(),
    path: '/periods',
    open: async () => {
      const dialog = await periodAction('This period’s salary has not arrived yet')
      await retype(within(dialog).getByLabelText(/Salary now expected on/), '20.11.2026')
      return dialog
    },
    preview: 'preview_reopen',
    ok: () => [],
    write: 'reopen_previous_period',
    save: 'Save',
    field: (dialog) => within(dialog).getByLabelText(/Salary now expected on/),
  },
  {
    name: 'move a period’s start',
    db: () => householdDb(),
    path: '/periods',
    open: async () => {
      const dialog = await periodAction('This period’s salary actually arrived on another day')
      await retype(within(dialog).getByLabelText(/Day the salary arrived/), '27.10.2026')
      return dialog
    },
    preview: 'preview_move_period_start',
    ok: () => [moveAccepted],
    write: 'move_period_start',
    save: 'Save',
    field: (dialog) => within(dialog).getByLabelText(/Day the salary arrived/),
  },
  {
    name: 'edit an income',
    db: () => householdDb(),
    path: '/income',
    open: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Actions for Salary' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
      const dialog = await screen.findByRole('dialog')
      await choose(dialog, 'Pay day', 'Day 20')
      return dialog
    },
    preview: 'preview_update_income',
    write: 'update_income',
    save: 'Save',
    field: (dialog) => within(dialog).getByLabelText('Name'),
  },
  {
    name: 'make an income primary',
    db: () =>
      householdDb(undefined, {
        income_overview: [
          incomeRow(),
          incomeRow({ id: 'income-2', name: 'Sam’s salary', is_primary: false }),
        ],
      }),
    path: '/income',
    open: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Actions for Sam’s salary' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Make primary' }))
      return screen.findByRole('alertdialog')
    },
    preview: 'preview_set_primary_income',
    write: 'set_primary_income',
    save: 'Make primary',
  },
]

/** Reads every preview again (as a refetch does), the page's other reads untouched. */
function readPreviewsAgain(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some((part) => typeof part === 'string' && part.includes('preview')),
  })
}

describe('every save that shows a preview waits for it; after “Try again” the focus is in the form [R-APP-440] [R-APP-481]', () => {
  it.each(FORMS)(
    '$name: disabled while the preview loads, is read again, was refused or failed; Enter sends nothing then',
    async (form) => {
      const db = form.db()
      let mode: Mode = 'wait'
      const own = db.rpc[form.preview].getMockImplementation()
      const ok = form.ok ?? ((args: Record<string, unknown>) => own?.(args))
      const answer = (args: Record<string, unknown>) =>
        mode === 'ok'
          ? ok(args)
          : mode === 'refuse'
            ? rpcError('period_not_found')
            : rpcError('TypeError: Failed to fetch', '')
      // Previews asked while waiting answer once the mode changes (as a slow network would).
      const waiting: { args: Record<string, unknown>; done: (value: () => unknown) => void }[] = []
      db.rpc[form.preview].mockImplementation((args: Record<string, unknown>) =>
        mode === 'wait'
          ? new Promise<unknown>((resolve, reject) =>
              waiting.push({
                args,
                done: (value) => {
                  try {
                    resolve(value())
                  } catch (error) {
                    reject(error)
                  }
                },
              }),
            )
          : answer(args),
      )
      const setMode = (next: Mode) => {
        mode = next
        if (next === 'wait') return
        for (const item of waiting.splice(0)) item.done(() => answer(item.args))
      }
      mock.current = createSupabaseMock(fakeSession(), db)
      const { queryClient } = renderRoutes(routes, form.path)
      const dialog = await form.open()
      const save = () => within(dialog).getByRole('button', { name: form.save })
      const enterSendsNothing = async () => {
        // A confirmation without a field has nothing to press Enter in (its focus is on Cancel).
        const field = form.field?.(dialog)
        if (field) {
          field.focus()
          await userEvent.keyboard('{Enter}')
        }
        expect(db.rpc[form.write]).not.toHaveBeenCalled()
      }

      // While the preview of these arguments loads.
      await waitFor(() => {
        expect(db.rpc[form.preview]).toHaveBeenCalled()
      })
      expect(save()).toBeDisabled()
      await enterSendsNothing()

      // Shown: Save may send.
      setMode('ok')
      readPreviewsAgain(queryClient)
      await waitFor(() => {
        expect(save()).toBeEnabled()
      })

      // Typed ahead of the preview: the arguments it would send have no preview yet.
      if (form.typeAhead) {
        setMode('wait')
        await form.typeAhead(dialog)
        expect(save()).toBeDisabled()
        await enterSendsNothing()
        setMode('ok')
        readPreviewsAgain(queryClient)
        await waitFor(() => {
          expect(save()).toBeEnabled()
        })
      }

      // Read again (a refetch keeps the answer on screen): Save waits for the new one.
      setMode('wait')
      readPreviewsAgain(queryClient)
      await waitFor(() => {
        expect(save()).toBeDisabled()
      })
      await enterSendsNothing()

      // Refused: the refusal is the answer.
      setMode('refuse')
      readPreviewsAgain(queryClient)
      await waitFor(() => {
        expect(save()).toBeDisabled()
      })
      await enterSendsNothing()

      // Failed to load (retried once, then said).
      setMode('fail')
      readPreviewsAgain(queryClient)
      await within(dialog).findByTestId('preview-failed', {}, { timeout: 4000 })
      expect(save()).toBeDisabled()
      await enterSendsNothing()

      // "Try again", shown at last: Save may send, and the focus is on the form's first field
      // or its confirmation [R-APP-481], not on the dialog.
      setMode('ok')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
      await waitFor(() => {
        expect(save()).toBeEnabled()
      })
      await waitFor(() => {
        const active = document.activeElement
        expect(active === save() || active?.matches('input, textarea, [role=combobox]')).toBe(true)
      })
      expect(dialog.contains(document.activeElement)).toBe(true)
      await userEvent.click(save())
      await waitFor(() => {
        expect(db.rpc[form.write]).toHaveBeenCalledTimes(1)
      })
    },
    15_000,
  )
})
