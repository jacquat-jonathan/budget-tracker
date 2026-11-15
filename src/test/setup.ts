import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

import i18n from '@/lib/i18n'

// jsdom lacks matchMedia, used by the theme provider and the sidebar.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom lacks these too; Radix (radio group, select, dialogs) uses them.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub })
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.hasPointerCapture = vi.fn(() => false)
Element.prototype.releasePointerCapture = vi.fn()

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})
