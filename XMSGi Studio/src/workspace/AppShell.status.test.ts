import { createElement, useContext } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { AppShell, getTelegramStatusPresentation } from './AppShell';
import { QuickPlannerNavigationContext } from './QuickPlannerNavigationContext';

const baseStatus = {
  accountId: 'telegram-session:active-account',
  status: 'normal' as const,
};

function QuickPlannerNavigationTestButtons() {
  const { currentSection, openQuickPlan, openStudio, openPosts, openSettings } = useContext(QuickPlannerNavigationContext);
  return createElement('div', null,
    createElement('span', null, 'Current screen'),
    createElement('span', { 'data-testid': 'quickplanner-current-section' }, currentSection),
    createElement('button', { type: 'button', onClick: openStudio }, 'Studio from Quick Plan'),
    createElement('button', { type: 'button', onClick: openQuickPlan }, 'Quick Plan from Studio'),
    createElement('button', { type: 'button', onClick: openPosts }, 'Posts from Quick Plan'),
    createElement('button', { type: 'button', onClick: openSettings }, 'Settings from Quick Plan'),
  );
}

describe('Telegram status presentation', () => {
  it.each([
    ['normal', { ...baseStatus, status: 'normal' as const }, 'normal', 'telegramStatus.connected'],
    ['rate limited', { ...baseStatus, status: 'rate-limited' as const }, 'warning', 'telegramStatus.rateLimited'],
    ['slowmode', { ...baseStatus, status: 'slowmode' as const }, 'warning', 'telegramStatus.slowmode'],
    ['auth required', { ...baseStatus, status: 'auth required' as const }, 'error', 'telegramStatus.authRequired'],
    ['network retrying', { ...baseStatus, status: 'network/retrying' as const }, 'warning', 'telegramStatus.network'],
    ['permission error', { ...baseStatus, status: 'error' as const, category: 'permission' as const }, 'error', 'telegramStatus.permission'],
    ['unknown error', { ...baseStatus, status: 'error' as const, category: 'unknown' as const }, 'error', 'telegramStatus.error'],
  ])('maps %s to a visible presentation', (_name, status, tone, labelKey) => {
    expect(getTelegramStatusPresentation(status)).toMatchObject({ tone, labelKey });
  });
});

describe('shared History Drawer entry point', () => {
  beforeEach(() => {
    window.localStorage.removeItem('xmsgi-history-drawer-open');
  });

  it.each(['planner', 'studio'] as const)('opens the same drawer from %s', (view) => {
    const onOpenSettings = vi.fn();
    const onViewChange = vi.fn();
    const plannerNavigation = createElement(QuickPlannerNavigationTestButtons);

    render(createElement(LocaleProvider, null, createElement(AppShell, {
      view,
      onViewChange,
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings,
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, plannerNavigation)));

    expect(screen.getByTestId('quickplanner-current-section')).toHaveTextContent(view === 'planner' ? 'quick-plan' : 'studio');
    fireEvent.click(screen.getByRole('button', { name: 'Studio from Quick Plan' }));
    expect(onViewChange).toHaveBeenCalledWith('studio');
    fireEvent.click(screen.getByRole('button', { name: 'Quick Plan from Studio' }));
    expect(onViewChange).toHaveBeenCalledWith('planner');

    fireEvent.click(screen.getByRole('button', { name: 'Posts from Quick Plan' }));
    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    expect(screen.getByTestId('quickplanner-current-section')).toHaveTextContent('posts');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('quickplanner-current-section')).toHaveTextContent(view === 'planner' ? 'quick-plan' : 'studio');

    fireEvent.click(screen.getByRole('button', { name: 'Settings from Quick Plan' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Posts' }));

    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    expect(screen.getByText('Current screen')).toBeInTheDocument();
  });

  it('closes Posts before navigating to Studio or Settings from Quick Planner', () => {
    const onOpenSettings = vi.fn();
    const onViewChange = vi.fn();
    const plannerNavigation = createElement(QuickPlannerNavigationTestButtons);

    render(createElement(LocaleProvider, null, createElement(AppShell, {
      view: 'planner',
      onViewChange,
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings,
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, plannerNavigation)));

    fireEvent.click(screen.getByRole('button', { name: 'Posts from Quick Plan' }));
    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Studio from Quick Plan' }));
    expect(screen.queryByRole('dialog', { name: 'Posts' })).not.toBeInTheDocument();
    expect(onViewChange).toHaveBeenCalledWith('studio');

    fireEvent.click(screen.getByRole('button', { name: 'Posts from Quick Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings from Quick Plan' }));
    expect(screen.queryByRole('dialog', { name: 'Posts' })).not.toBeInTheDocument();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('closes Posts before topbar Studio and Settings navigation', () => {
    window.localStorage.removeItem('xmsgi-history-drawer-open');
    const onOpenSettings = vi.fn();
    const onViewChange = vi.fn();
    const view = render(createElement(LocaleProvider, null, createElement(AppShell, {
      view: 'planner',
      onViewChange,
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings,
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, createElement('div', null, 'Quick Planner'))));

    fireEvent.click(screen.getByRole('button', { name: 'Posts' }));
    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    fireEvent.click(view.container.querySelector('.product-mode-switch') as HTMLButtonElement);
    expect(onViewChange).toHaveBeenCalledWith('studio');
    expect(screen.queryByRole('dialog', { name: 'Posts' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Posts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Posts' })).not.toBeInTheDocument();
  });

  it('orders History, Settings, and Log out in the topbar', () => {
    const view = render(createElement(LocaleProvider, null, createElement(AppShell, {
      view: 'studio',
      onViewChange: vi.fn(),
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings: vi.fn(),
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, createElement('div', null, 'Current screen'))));

    const labels = Array.from(view.container.querySelectorAll('.topbar-actions .action-label'))
      .map((label) => label.textContent);
    expect(labels).toEqual(['Posts', 'Settings', 'Log out']);
    const studioHeading = view.container.querySelector('.product-section-title-detached');
    expect(studioHeading?.textContent).toBe('Studio');
    expect(studioHeading?.querySelector('svg')).not.toBeNull();
    view.unmount();
  });

  it('leaves the Planner heading to the page layout', () => {
    const view = render(createElement(LocaleProvider, null, createElement(AppShell, {
      view: 'planner',
      onViewChange: vi.fn(),
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings: vi.fn(),
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, createElement('div', null, 'Quick Planner'))));

    expect(view.container.querySelector('.product-section-title')).not.toBeInTheDocument();
    expect(view.container.querySelector('.quick-planner-page')).not.toBeInTheDocument();
    expect(screen.getByText('Quick Planner')).toBeInTheDocument();
  });

  it('shows only Done in the topbar while Settings is open', () => {
    const onCloseSettings = vi.fn();
    const view = render(createElement(LocaleProvider, null, createElement(AppShell, {
      view: 'planner',
      onViewChange: vi.fn(),
      settingsOpen: true,
      onCloseSettings,
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings: vi.fn(),
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    }, createElement('div', null, 'Settings page'))));

    const actionButtons = Array.from(view.container.querySelectorAll('.topbar-actions button'));
    expect(actionButtons).toHaveLength(1);
    expect(actionButtons[0]).toHaveAccessibleName('Done');
    expect(view.container.querySelector('.product-mode-switch')).not.toBeInTheDocument();
    expect(view.container.querySelector('.product-section-title')).not.toBeInTheDocument();
    expect(view.container.querySelector('.settings-view-done')).not.toBeInTheDocument();

    fireEvent.click(actionButtons[0]);
    expect(onCloseSettings).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('does not restore a modal Posts drawer from a previous session', () => {
    const props = {
      view: 'studio' as const,
      onViewChange: vi.fn(),
      connected: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings: vi.fn(),
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    };
    const renderShell = () => render(createElement(
      LocaleProvider,
      null,
      createElement(AppShell, props, createElement('div', null, 'Current screen')),
    ));
    const firstView = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Posts' }));
    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    firstView.unmount();

    window.localStorage.setItem('xmsgi-history-drawer-open', 'true');
    const secondView = renderShell();
    try {
      expect(screen.queryByRole('dialog', { name: 'Posts' })).not.toBeInTheDocument();
    } finally {
      secondView.unmount();
    }
  });

  it('reserves the topbar height while connection status is pending', () => {
    const props = {
      view: 'studio' as const,
      onViewChange: vi.fn(),
      connected: false,
      headerPending: true,
      authBusy: false,
      isConfirmingLogout: false,
      setIsConfirmingLogout: vi.fn(),
      setShowAuthForm: vi.fn(),
      handleDisconnect: async () => undefined,
      handleForgetAccount: async () => undefined,
      onOpenSettings: vi.fn(),
      historyRecords: [],
      onHistoryCancel: vi.fn(),
      onHistoryReschedule: vi.fn(),
      onHistorySendNow: vi.fn(),
      onHistoryDelete: vi.fn(),
      onHistoryOpenDraft: vi.fn(),
      onHistoryClearSent: vi.fn(),
    };
    const view = render(createElement(LocaleProvider, null, createElement(AppShell, props, createElement('div', null, 'Studio'))));

    expect(view.container.querySelector('.topbar-placeholder')).toBeInTheDocument();

    view.rerender(createElement(LocaleProvider, null, createElement(AppShell, { ...props, connected: true, headerPending: false }, createElement('div', null, 'Studio'))));

    expect(view.container.querySelector('.topbar-placeholder')).not.toBeInTheDocument();
    expect(view.container.querySelector('.topbar')).toBeInTheDocument();
  });
});
