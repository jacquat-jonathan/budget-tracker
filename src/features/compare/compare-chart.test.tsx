import { render, screen } from '@testing-library/react'

import {
  periodLabels,
  signedMoney,
  SLOT_DASHES,
  SLOT_MARKS,
} from '@/features/compare/compare-format'
import { SlotSwatch } from '@/features/compare/components/category-chart'
import { ChartFrame } from '@/features/compare/components/chart-frame'

describe('a difference [R-COMPARE-281]', () => {
  it('has its sign before the currency in both directions', () => {
    expect(signedMoney(19_292)).toBe('+CHF 192.92')
    expect(signedMoney(-19_292)).toBe('−CHF 192.92')
    expect(signedMoney(0)).toBe('CHF 0.00')
  })
})

describe('period labels [R-COMPARE-280]', () => {
  it('give the year on the first period and wherever it changes', () => {
    const labels = periodLabels([
      { start_date: '2024-11-25' },
      { start_date: '2024-12-25' },
      { start_date: '2025-01-25' },
      { start_date: '2025-11-25' },
    ])
    expect(labels).toEqual([
      { dayMonth: '25.11', year: '2024' },
      { dayMonth: '25.12', year: null },
      { dayMonth: '25.01', year: '2025' },
      { dayMonth: '25.11', year: null },
    ])
  })
})

describe('the category chart’s marks [R-COMPARE-192]', () => {
  it('gives each of the five slots its own shape and dash, in the legend too', () => {
    expect(new Set(SLOT_MARKS).size).toBe(5)
    expect(new Set(SLOT_DASHES).size).toBe(5)
    const { container } = render(
      <>
        {[0, 1, 2, 3, 4].map((slot) => (
          <SlotSwatch key={slot} slot={slot} />
        ))}
      </>,
    )
    const swatches = [...container.querySelectorAll('svg')]
    const shapes = swatches.map((svg) => {
      const mark = svg.lastElementChild
      return `${mark?.tagName}:${mark?.getAttribute('points') ? 'poly' : ''}`
    })
    expect(
      new Set(
        swatches.map((svg) => svg.querySelector('line')?.getAttribute('stroke-dasharray') ?? ''),
      ).size,
    ).toBe(5)
    // circle, rect, two different polygons, a path.
    expect(shapes).toEqual(['circle:', 'rect:', 'polygon:poly', 'polygon:poly', 'path:'])
  })
})

describe('a chart wider than its frame [R-COMPARE-282]', () => {
  let width = 0
  const original = window.ResizeObserver
  beforeEach(() => {
    window.ResizeObserver = class {
      private readonly callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe() {
        this.callback([{ contentRect: { width } } as unknown as ResizeObserverEntry], this)
      }
      unobserve() {}
      disconnect() {}
    }
  })
  afterEach(() => {
    window.ResizeObserver = original
  })

  it('keeps the value axis outside, shows whole periods only, is named and reachable, and says it scrolls', () => {
    width = 250
    render(
      <ChartFrame
        count={24}
        minBand={24}
        height={272}
        axis={{ ticks: [0, 500_000], decimals: false }}
        name="The trend"
      >
        <div />
      </ChartFrame>,
    )
    const frame = screen.getByRole('group', { name: 'The trend' })
    expect(frame).toHaveAttribute('tabindex', '0')
    // 250 px hold 10 periods of 25 px: the content is 24 of them, opened on the newest.
    expect((frame.firstElementChild as HTMLElement).style.width).toBe('600px')
    expect(frame.scrollLeft).toBe(350)
    expect(screen.getByTestId('value-axis')).toHaveTextContent("CHF05'000")
    expect(screen.getByTestId('chart-scrolls')).toHaveTextContent(
      'Showing 10 of 24 periods: earlier ones are to the left.',
    )
  })

  it('takes the width and does not scroll when every period fits', () => {
    width = 700
    render(
      <ChartFrame
        count={24}
        minBand={24}
        height={272}
        axis={{ ticks: [0, 100], decimals: false }}
        name="The trend"
      >
        <div />
      </ChartFrame>,
    )
    expect(screen.queryByRole('group', { name: 'The trend' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('chart-scrolls')).not.toBeInTheDocument()
  })
})
