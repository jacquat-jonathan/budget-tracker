/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Normalise the configured base path so it always starts and ends with a slash
 * ("" and "/" -> "/", "budget" -> "/budget/").
 */
function normaliseBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const base = normaliseBase(process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH)

  return {
    base,
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks that stay cached across app releases.
          codeSplitting: {
            groups: [
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
    },
  }
})
