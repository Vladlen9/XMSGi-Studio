import { Moon, RotateCcw, Sun } from 'lucide-react';
import type { Locale } from '@shared/i18n';
import type { ColorTheme } from '@/lib/colorTheme';
import './TestbenchNavigation.css';

export type TestbenchScenarioOption = {
  value: string;
  label: string;
};

type TestbenchNavigationProps = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: ColorTheme;
  onThemeChange: (theme: ColorTheme) => void;
  scenarioLabel: string;
  scenario: string;
  scenarioOptions: TestbenchScenarioOption[];
  onScenarioChange: (scenario: string) => void;
  confirmationLabel?: string;
  confirmationScenario?: string;
  confirmationOptions?: TestbenchScenarioOption[];
  onConfirmationScenarioChange?: (scenario: string) => void;
  onReset: () => void;
  resetLabel: string;
  currentPage: 'studio' | 'planner';
};

export function TestbenchNavigation({
  locale,
  setLocale,
  theme,
  onThemeChange,
  scenarioLabel,
  scenario,
  scenarioOptions,
  onScenarioChange,
  confirmationLabel,
  confirmationScenario,
  confirmationOptions,
  onConfirmationScenarioChange,
  onReset,
  resetLabel,
  currentPage,
}: TestbenchNavigationProps) {
  const isRussian = locale === 'ru';

  return (
    <nav className="testbench-navigation" aria-label={isRussian ? 'Настройки стенда' : 'Stand controls'}>
      <label className="testbench-navigation-scenario">
        <span>{scenarioLabel}</span>
        <select
          aria-label={scenarioLabel}
          value={scenario}
          onChange={(event) => onScenarioChange(event.target.value)}
        >
          {scenarioOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {confirmationLabel && confirmationScenario !== undefined && confirmationOptions && onConfirmationScenarioChange && (
        <label className="testbench-navigation-scenario">
          <span>{confirmationLabel}</span>
          <select
            aria-label={confirmationLabel}
            value={confirmationScenario}
            onChange={(event) => onConfirmationScenarioChange(event.target.value)}
          >
            {confirmationOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
      <div className="testbench-navigation-themes" role="group" aria-label={isRussian ? 'Тема стенда' : 'Stand theme'}>
        <button
          type="button"
          aria-label={isRussian ? 'Светлая тема' : 'Light theme'}
          aria-pressed={theme === 'light'}
          onClick={() => onThemeChange('light')}
        >
          <Sun size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={isRussian ? 'Тёмная тема' : 'Dark theme'}
          aria-pressed={theme === 'dark'}
          onClick={() => onThemeChange('dark')}
        >
          <Moon size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="testbench-navigation-languages" role="group" aria-label={isRussian ? 'Язык' : 'Language'}>
        <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
        <button type="button" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>RU</button>
      </div>
      <button
        type="button"
        className="testbench-navigation-reset"
        onClick={onReset}
        aria-label={resetLabel}
        title={resetLabel}
      >
        <RotateCcw size={15} aria-hidden="true" />
        <span>{resetLabel}</span>
      </button>
      <div className="testbench-navigation-pages" aria-label={isRussian ? 'Страницы стендов' : 'Testbench pages'}>
        <a href="../login/">{isRussian ? 'Вход' : 'Login'}</a>
        <a href="../studio-editor/" aria-current={currentPage === 'studio' ? 'page' : undefined}>Studio</a>
        <a href="../planner/" aria-current={currentPage === 'planner' ? 'page' : undefined}>Planner</a>
        <a href="../settings/">{isRussian ? 'Настройки' : 'Settings'}</a>
        <a href="../">{isRussian ? 'Все стенды' : 'All pages'}</a>
      </div>
    </nav>
  );
}
