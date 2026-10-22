import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyColorTheme, COLOR_THEME_STORAGE_KEY } from './colorTheme';

describe('applyColorTheme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem(COLOR_THEME_STORAGE_KEY);
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
    document.documentElement.classList.remove('is-theme-transitioning');
    applyColorTheme('light');
  });

  afterEach(() => {
    applyColorTheme('light');
    vi.useRealTimers();
  });

  it('keeps the transition active until the background color animation has completed', () => {
    applyColorTheme('dark', { animate: true });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement).toHaveClass('is-theme-transitioning');
    expect(localStorage.getItem(COLOR_THEME_STORAGE_KEY)).toBe('dark');

    vi.advanceTimersByTime(480);
    expect(document.documentElement).toHaveClass('is-theme-transitioning');

    vi.advanceTimersByTime(40);
    expect(document.documentElement).not.toHaveClass('is-theme-transitioning');
  });

  it('restarts the transition timer when the theme changes again before completion', () => {
    applyColorTheme('dark', { animate: true });
    vi.advanceTimersByTime(240);

    applyColorTheme('light', { animate: true });
    vi.advanceTimersByTime(480);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement).toHaveClass('is-theme-transitioning');

    vi.advanceTimersByTime(40);
    expect(document.documentElement).not.toHaveClass('is-theme-transitioning');
  });
});
