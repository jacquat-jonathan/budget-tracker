const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An id from the address is asked for only when it is a uuid: anything else is no record. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value)
}
