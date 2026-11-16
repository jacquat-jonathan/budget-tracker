import { paths } from '@/app/paths'

/** The address of a period's progress: the dashboard, browsed to that period. */
export function progressPath(periodId: string): string {
  return `${paths.dashboard}?period=${periodId}`
}
