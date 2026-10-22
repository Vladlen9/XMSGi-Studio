import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { TelegramStatusSnapshot } from '@/hooks/useTelegramAuth';
import { LocaleProvider, useLocale } from '@/lib/i18n';
import { SettingsPage } from '@/pages/SettingsPage';
import { TESTBENCH_COLOR_THEME_STORAGE_KEY, applyTestbenchColorTheme, readTestbenchColorTheme } from '../shared/testbenchTheme';
import '../shared/TestbenchNavigation.css';
import '../../src/index.css';
import '../../src/styles/colorThemes.css';
import './main.css';

applyTestbenchColorTheme(readTestbenchColorTheme());

function SettingsTestbench() {
  const { locale } = useLocale();
  const isRussian = locale === 'ru';
  const telegramStatus: TelegramStatusSnapshot = { accountId: 'settings-testbench', status: 'normal' };

  return (
    <div className="settings-testbench">
      <nav className="testbench-navigation" aria-label={isRussian ? 'Страницы стендов' : 'Testbench pages'}>
        <div className="testbench-navigation-pages">
          <a href="../login/">{isRussian ? 'Вход' : 'Login'}</a>
          <a href="../studio-editor/">Studio</a>
          <a href="../planner/">Planner</a>
          <a href="../settings/" aria-current="page">{isRussian ? 'Настройки' : 'Settings'}</a>
          <a href="../">{isRussian ? 'Все стенды' : 'All pages'}</a>
          <a className="settings-testbench-exit" href="/">{isRussian ? 'Выход' : 'Exit'}</a>
        </div>
      </nav>
      <SettingsPage
        colorThemeStorageKey={TESTBENCH_COLOR_THEME_STORAGE_KEY}
        onClose={() => undefined}
        accountName=""
        telegramUsername=""
        telegramConnected={false}
        telegramConnecting={false}
        telegramAuthStep="phone"
        telegramPhoneNumber=""
        telegramPhoneCode=""
        telegramTwoFactorPassword=""
        telegramAuthBusy={false}
        telegramAuthError=""
        telegramStatus={telegramStatus}
        telegramCredentials={{ hasCredentials: false, hasSession: false, connected: false, signedOut: false }}
        telegramApiId=""
        telegramApiHash=""
        telegramCredentialsBusy={false}
        telegramCredentialsError=""
        onTelegramApiIdChange={() => undefined}
        onTelegramApiHashChange={() => undefined}
        onSaveTelegramCredentials={() => undefined}
        onTelegramPhoneNumberChange={() => undefined}
        onTelegramPhoneCodeChange={() => undefined}
        onTelegramTwoFactorPasswordChange={() => undefined}
        onTelegramAuth={() => undefined}
        onTelegramReconnect={() => undefined}
        onTelegramDisconnect={() => undefined}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <SettingsTestbench />
    </LocaleProvider>
  </StrictMode>,
);
