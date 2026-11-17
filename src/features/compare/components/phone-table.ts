/**
 * Compare's tables on a phone (below `sm`): each row a block, its header on a line of its own,
 * each figure under the name of its column (the cell's data-label), so nothing is cut and
 * nothing scrolls sideways. From `sm` up they are ordinary tables.
 */
// R-COMPARE-530: on a phone every figure of Compare's tables is in view, under its column's name.
export const PHONE_HEAD = 'max-sm:sr-only'
export const PHONE_ROW =
  'border-b last:border-b-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1 max-sm:pb-2'
export const PHONE_ROW_3 =
  'border-b last:border-b-0 max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:py-3'
export const PHONE_NAME = 'max-sm:col-span-2 max-sm:pb-0'
export const PHONE_NAME_3 =
  'max-sm:static max-sm:col-span-3 max-sm:w-auto max-sm:max-w-none max-sm:min-w-0 max-sm:p-0'
export const PHONE_CELL =
  'max-sm:min-w-0 max-sm:p-0 max-sm:text-left max-sm:whitespace-normal max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]'
export const PHONE_DIFFERENCE =
  'max-sm:col-span-2 max-sm:flex max-sm:items-baseline max-sm:gap-2 max-sm:p-0 max-sm:text-left max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]'
export const PHONE_WIDE = 'max-sm:col-span-2 max-sm:p-0'
