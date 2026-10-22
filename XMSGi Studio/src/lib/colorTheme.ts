export type ColorTheme = 'light' | 'dark';

export const COLOR_THEME_STORAGE_KEY = 'xmsgi-color-theme-v1';
const THEME_TRANSITION_DURATION_MS = 520;
let themeTransitionTimeout: number | undefined;

export function readColorTheme(storageKey = COLOR_THEME_STORAGE_KEY): ColorTheme {
  try {
    return window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyColorTheme(theme: ColorTheme, options: { animate?: boolean; storageKey?: string } = {}) {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const themeChanged = root.dataset.theme !== theme;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

    if (options.animate && themeChanged && !prefersReducedMotion) {
      if (themeTransitionTimeout !== undefined) window.clearTimeout(themeTransitionTimeout);
      root.classList.add('is-theme-transitioning');
      void root.offsetWidth;
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      themeTransitionTimeout = window.setTimeout(() => {
        root.classList.remove('is-theme-transitioning');
        themeTransitionTimeout = undefined;
      }, THEME_TRANSITION_DURATION_MS);
    } else {
      if (themeTransitionTimeout !== undefined) window.clearTimeout(themeTransitionTimeout);
      themeTransitionTimeout = undefined;
      root.classList.remove('is-theme-transitioning');
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    }
  }

  try {
    window.localStorage.setItem(options.storageKey ?? COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // Keep the current theme when browser storage is unavailable.
  }
}