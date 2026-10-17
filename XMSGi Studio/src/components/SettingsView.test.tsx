import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramStatusSnapshot } from '@/hooks/useTelegramAuth';
import { LocaleProvider } from '@/lib/i18n';
import { EDITOR_APPEARANCE_STORAGE_KEY, EDITOR_APPEARANCE_UPDATED_EVENT } from '@shared/editorAppearance';
import { SettingsView } from './SettingsView';

function renderSettings(overrides: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  const onTelegramDisconnect = vi.fn();
  const onTelegramReconnect = vi.fn();
  const { container } = render(
    <LocaleProvider>
      <SettingsView
        onClose={vi.fn()}
        accountName="Alex Example"
        telegramUsername="alex_example"
        telegramConnected
        telegramConnecting={false}
        telegramAuthStep="phone"
        telegramPhoneNumber=""
        telegramPhoneCode=""
        telegramTwoFactorPassword=""
        telegramAuthBusy={false}
        telegramAuthError=""
        telegramStatus={{ accountId: 'account-1', status: 'normal' } satisfies TelegramStatusSnapshot}
        telegramCredentials={{ hasCredentials: true, hasSession: true, connected: true, signedOut: false }}
        telegramApiId=""
        telegramApiHash=""
        telegramCredentialsBusy={false}
        telegramCredentialsError=""
        onTelegramApiIdChange={vi.fn()}
        onTelegramApiHashChange={vi.fn()}
        onSaveTelegramCredentials={vi.fn()}
        onTelegramPhoneNumberChange={vi.fn()}
        onTelegramPhoneCodeChange={vi.fn()}
        onTelegramTwoFactorPasswordChange={vi.fn()}
        onTelegramAuth={vi.fn()}
        onTelegramReconnect={onTelegramReconnect}
        onTelegramDisconnect={onTelegramDisconnect}
        {...overrides}
      />
    </LocaleProvider>,
  );

  return { container, onTelegramDisconnect, onTelegramReconnect };
}

beforeEach(() => {
  localStorage.removeItem(EDITOR_APPEARANCE_STORAGE_KEY);
});

describe('SettingsView Telegram integration', () => {
  it('shows the Studio tagline and requested Settings version', () => {
    renderSettings();

    expect(screen.getByText('XMSGi Studio — Create messages, save ideas, schedule posts, and keep everything under control in one convenient workspace.')).toBeInTheDocument();
    expect(screen.getByText('Version 1.1.0')).toBeInTheDocument();
  });

  it('shows the requested Russian Studio description in About', () => {
    const originalLocale = window.localStorage.getItem('awaitmsg_locale');
    window.localStorage.setItem('awaitmsg_locale', 'ru');

    try {
      renderSettings();
      expect(screen.getByText('XMSGi Studio — Создавайте сообщения, храните идеи, планируйте отправку и держите всё под контролем — в одном удобном рабочем пространстве.')).toBeInTheDocument();
    } finally {
      if (originalLocale === null) window.localStorage.removeItem('awaitmsg_locale');
      else window.localStorage.setItem('awaitmsg_locale', originalLocale);
    }
  });

  it('persists custom action colors and updates the editor preview', () => {
    const onAppearanceUpdated = vi.fn();
    window.addEventListener(EDITOR_APPEARANCE_UPDATED_EVENT, onAppearanceUpdated);
    renderSettings();
    const appearance = screen.getByRole('region', { name: 'Editor appearance' });
    const preview = within(appearance).getByRole('region', { name: 'Editor preview' });

    expect(preview).toHaveClass('is-outline');
    expect(within(appearance).getByRole('group', { name: 'Color mode' })).toBeInTheDocument();
    expect(within(appearance).queryByRole('group', { name: 'Editor appearance style' })).not.toBeInTheDocument();

    fireEvent.click(within(appearance).getByRole('button', { name: 'Custom' }));
    fireEvent.change(within(appearance).getByLabelText('Schedule color'), { target: { value: '#287fa6' } });

    const savedAppearance = JSON.parse(localStorage.getItem(EDITOR_APPEARANCE_STORAGE_KEY) || '{}');
    expect(savedAppearance).toMatchObject({
      palette: 'custom',
      modeColors: { send: '#ffffff', schedule: '#287fa6', draft: '#ffffff' },
    });
    expect(preview).toHaveAttribute('data-palette', 'custom');
    const scheduleRow = within(preview).getByText('Schedule').closest<HTMLElement>('.settings-editor-preview-mode');
    expect(scheduleRow?.style.getPropertyValue('--settings-editor-accent')).toBe('#287fa6');
    expect(onAppearanceUpdated).toHaveBeenCalledTimes(2);

    window.removeEventListener(EDITOR_APPEARANCE_UPDATED_EVENT, onAppearanceUpdated);
  });

  it('keeps API fields out of the main settings screen', () => {
    const { container } = renderSettings();

    const summary = screen.getByRole('button', { name: /alex_example/ });
    expect(summary).toHaveTextContent('Manage');
    expect(summary.querySelector('.settings-telegram-mark')).not.toBeInTheDocument();
    expect(summary.parentElement?.firstElementChild).toHaveClass('settings-telegram-mark');
    expect(container.querySelector('.telegram-credentials-form')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API_ID')).not.toBeInTheDocument();
  });

  it('does not open Telegram setup automatically for an empty profile', () => {
    renderSettings({
      telegramConnected: false,
      telegramCredentials: { hasCredentials: false, hasSession: false, connected: false, signedOut: false },
    });

    expect(screen.queryByRole('dialog', { name: 'Manage connection' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API_ID')).not.toBeInTheDocument();
  });

  it('opens connection controls and reveals API fields only on demand', () => {
    const { onTelegramDisconnect } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /alex_example/ }));

    const dialog = screen.getByRole('dialog', { name: 'Manage connection' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(Array.from(dialog.querySelectorAll('.telegram-manager-actions > button')).map((button) => button.textContent?.trim()))
      .toEqual(['Disconnect account', 'Cancel']);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect account' }));
    expect(onTelegramDisconnect).toHaveBeenCalledOnce();

    const advancedSettings = document.querySelector('.telegram-manager-advanced') as HTMLDetailsElement;
    const technicalDetails = document.querySelector('.telegram-manager-details');
    expect(advancedSettings.open).toBe(false);
    expect(technicalDetails).not.toBeVisible();
    fireEvent.click(screen.getByText('Advanced API settings'));
    expect(advancedSettings.open).toBe(true);
    expect(technicalDetails).toBeVisible();
    expect(screen.getByLabelText('API_ID')).toBeInTheDocument();
    expect(screen.getByLabelText('API_HASH')).toBeInTheDocument();
  });

  it('opens the API credential form for a saved session missing credentials', async () => {
    renderSettings({
      telegramConnected: false,
      telegramCredentials: { hasCredentials: false, hasSession: true, connected: false, signedOut: true },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Manage connection' });
    expect(dialog.querySelector('.telegram-manager-advanced')).toHaveAttribute('open');
    expect(screen.getByLabelText('API_ID')).toBeInTheDocument();
    expect(screen.getByLabelText('API_HASH')).toBeInTheDocument();
  });

  it('opens phone sign-in controls for a remembered account with no session', async () => {
    renderSettings({
      telegramConnected: false,
      telegramCredentials: { hasCredentials: true, hasSession: false, connected: false, signedOut: true },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Manage connection' });
    expect(dialog).toHaveTextContent('Signed out');
    expect(within(dialog).getByLabelText('Phone')).toBeInTheDocument();
  });

  it('offers reconnect for an existing Telegram session when disconnected', () => {
    const { onTelegramReconnect } = renderSettings({
      telegramConnected: false,
      telegramCredentials: { hasCredentials: true, hasSession: true, connected: false, signedOut: false },
    });

    fireEvent.click(screen.getByRole('button', { name: /Not connected/ }));
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(onTelegramReconnect).toHaveBeenCalledOnce();
  });
});