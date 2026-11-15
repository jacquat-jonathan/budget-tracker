import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

/** Keep in sync with the inline script in index.html, which applies the theme before paint. */
export const THEME_STORAGE_KEY = 'budget-tracker-theme'

export interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.')
  return context
}
