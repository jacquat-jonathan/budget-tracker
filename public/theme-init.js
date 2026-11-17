// Applies the stored theme before first paint, so dark-mode users never see a light flash.
// A separate file (not an inline script) so it runs under `script-src 'self'`. Loaded as a
// classic, render-blocking script from <head>. Keep the storage key in sync with
// src/components/theme/theme-context.ts.
;(function () {
  try {
    var stored = localStorage.getItem('budget-tracker-theme')
    var theme = stored === 'light' || stored === 'dark' ? stored : 'system'
    var dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch (e) {
    // Storage blocked: the theme provider applies the theme once the app loads.
  }
})()
