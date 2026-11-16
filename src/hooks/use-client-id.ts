import { useCallback, useState } from 'react'

import { dbErrorCode } from '@/lib/db-errors'

export interface ClientId {
  /** The id this form's next save sends as `p_client_id`. */
  id: string
  /** A new id: after a save went through, or the form was cleared for the next entry. */
  renew: () => void
  /**
   * After a failed save: a new id only when the database said this one was already used for
   * other values (`request_reused`); after a lost answer the same id is kept, so saving again
   * records once.
   */
  afterFailure: (error: unknown) => void
}

function newId(): string {
  return crypto.randomUUID()
}

/**
 * One id per user action of an add form: generated when the form opens, sent
 * with every save of it, and renewed once a save went through or the form is reset. A save sent
 * again after a lost answer, with the same values, records once and answers what the first save
 * created.
 */
// R-APP-250: a retried add carries the same client id, a new add a new one.
export function useClientId(): ClientId {
  const [id, setId] = useState(newId)
  const renew = useCallback(() => setId(newId()), [])
  const afterFailure = useCallback(
    (error: unknown) => {
      if (dbErrorCode(error) === 'request_reused') renew()
    },
    [renew],
  )
  return { id, renew, afterFailure }
}
