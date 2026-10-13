import { useState, type PropsWithChildren } from 'react';
import { FileText } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { getTelegramStatusPresentation as getTelegramStatusPresentationFromModule } from './telegramStatusPresentation';
import { HistoryDrawer } from './HistoryDrawer';
import { QuickPlannerNavigationContext } from './QuickPlannerNavigationContext';
import type { HistoryItem, HistorySource } from './historyModel';

/* eslint-disable react-refresh/only-export-components */
export { getTelegramStatusPresentationFromModule as getTelegramStatusPresentation };
/* eslint-enable react-refresh/only-export-components */

type AppShellProps = PropsWithChildren<{
  view: 'studio' | 'planner';
  onViewChange: (view: 'studio' | 'planner') => void;
  settingsOpen?: boolean;
  onCloseSettings?: () => void;
  connected: boolean;
  headerPending?: boolean;
  authBusy: boolean;
  isConfirmingLogout: boolean;
  setIsConfirmingLogout: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAuthForm: React.Dispatch<React.SetStateAction<boolean>>;
  handleDisconnect: () => Promise<void>;
  handleForgetAccount: () => Promise<void>;
  onOpenSettings: () => void;
  historyRecords: HistoryItem[];
  onHistoryCancel: (record: HistoryItem) => void;
  onHistoryReschedule: (record: HistoryItem) => void;
  onHistorySendNow: (record: HistoryItem) => void;
  onHistoryDelete: (record: HistoryItem) => void | Promise<boolean>;
  onHistoryOpenDraft: (record: HistoryItem) => void;
  onHistoryUseDraft?: (record: HistoryItem, destination?: 'planner' | 'studio') => void;
  onHistoryClearSent: (source: HistorySource | 'all') => void;
  onHistoryClearDrafts?: (source: HistorySource | 'all') => Promise<boolean>;
  onHistoryCancelQueue?: (records: HistoryItem[]) => Promise<boolean>;
}>;

export function AppShell({
  children,
  view,
  onViewChange,
  settingsOpen = false,
  onCloseSettings,
  connected,
  headerPending = false,
  authBusy,
  isConfirmingLogout,
  setIsConfirmingLogout,
  setShowAuthForm,
  handleDisconnect,
  handleForgetAccount,
  onOpenSettings,
  historyRecords,
  onHistoryCancel,
  onHistoryReschedule,
  onHistorySendNow,
  onHistoryDelete,
  onHistoryOpenDraft,
  onHistoryUseDraft,
  onHistoryClearSent,
  onHistoryClearDrafts,
  onHistoryCancelQueue,
}: AppShellProps) {
  const { t } = useLocale();
  const nextViewLabel = view === 'planner' ? t('product.studio') : t('product.planner');
  const sectionLabel = view === 'planner' ? t('product.planner') : t('product.studio');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySourceFilterOnOpen, setHistorySourceFilterOnOpen] = useState<'personal' | undefined>();
  const updateHistoryOpen = (nextIsOpen: boolean, sourceFilterOnOpen?: 'personal') => {
    setHistorySourceFilterOnOpen(nextIsOpen ? sourceFilterOnOpen : undefined);
    setIsHistoryOpen(nextIsOpen);
  };
  const changeView = (nextView: 'studio' | 'planner') => {
    updateHistoryOpen(false);
    onViewChange(nextView);
  };
  const openSettings = () => {
    updateHistoryOpen(false);
    onOpenSettings();
  };

  return (
    <div className={`product-shell ${view === 'planner' ? 'planner-shell' : 'studio-shell'}`} style={{ position: 'relative' }}>
      {!connected && headerPending && (
        <div className="topbar topbar-placeholder" aria-hidden="true" />
      )}
      {connected && (
        <header className="topbar">
          <div className="topbar-identity">
            <span className="brand" aria-label="XMSGi"><span>XMSGi</span></span>
          </div>

          {!settingsOpen && (
            <button
              type="button"
              className="settings-action product-mode-switch"
              aria-label={nextViewLabel}
              aria-pressed={view === 'planner'}
              onClick={() => changeView(view === 'planner' ? 'studio' : 'planner')}
            >
              <span className="action-label">{nextViewLabel}</span>
            </button>
          )}

          <div className="topbar-actions">
            {settingsOpen ? (
              <button type="button" className="settings-action" onClick={onCloseSettings} aria-label={t('settings.done')}>
                <span className="action-label">{t('settings.done')}</span>
              </button>
            ) : (
              <>
            <button
              type="button"
              className="settings-action"
              onClick={() => updateHistoryOpen(true)}
              title={t('history.title')}
              aria-label={t('history.title')}
            >
              <span className="action-label">{t('history.title')}</span>
            </button>

            <button
              type="button"
              className="settings-action"
              onClick={() => {
                setShowAuthForm(false);
                setIsConfirmingLogout(false);
                openSettings();
              }}
              title={t('topbar.settings')}
              aria-label={t('topbar.settings')}
            >
              <span className="action-label">{t('topbar.settings')}</span>
            </button>

            <div className="logout-action-group">
              <button
                className="account-action"
                onClick={() => setIsConfirmingLogout((current) => !current)}
                disabled={authBusy || !connected}
                title={t('auth.logout')}
                aria-label={t('auth.logout')}
                aria-expanded={isConfirmingLogout}
              >
                <span className="action-label">{t('auth.logout')}</span>
              </button>

              {isConfirmingLogout && connected && (
                <div className="logout-confirmation" role="dialog" aria-label={t('auth.confirmLogout')}>
                  <strong className="logout-confirmation-title">{t('auth.signOut')}</strong>
                  <div className="logout-choice-list" role="radiogroup" aria-label={t('auth.signOutPreference')}>
                    <button type="button" className="logout-choice" onClick={handleDisconnect} disabled={authBusy}>{t('auth.rememberMe')}</button>
                    <button type="button" className="logout-choice" onClick={handleForgetAccount} disabled={authBusy}>{t('auth.forgetMe')}</button>
                  </div>
                  <div className="logout-confirmation-actions">
                    <button type="button" className="logout-confirmation-action" onClick={() => setIsConfirmingLogout(false)} disabled={authBusy}>{t('common.cancel')}</button>
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </header>
      )}
      {connected && !settingsOpen && view !== 'planner' && (
        <div className="product-section-title product-section-title-detached" aria-current="page">
          <FileText size={19} strokeWidth={2.2} aria-hidden="true" />
          <span>{sectionLabel}</span>
        </div>
      )}
      <QuickPlannerNavigationContext.Provider value={{
        currentSection: settingsOpen ? 'settings' : isHistoryOpen ? 'posts' : view === 'studio' ? 'studio' : 'quick-plan',
        openQuickPlan: () => {
          updateHistoryOpen(false);
          changeView('planner');
        },
        openStudio: () => {
          updateHistoryOpen(false);
          changeView('studio');
        },
        openPosts: () => {
          updateHistoryOpen(true, 'personal');
        },
        openSettings,
      }}>
        <main className="product-shell-content">{children}</main>
      </QuickPlannerNavigationContext.Provider>
      <HistoryDrawer
        isOpen={isHistoryOpen}
        sourceFilterOnOpen={historySourceFilterOnOpen}
        onClose={() => updateHistoryOpen(false)}
        records={historyRecords}
        onCancel={onHistoryCancel}
        onReschedule={onHistoryReschedule}
        onSendNow={onHistorySendNow}
        onDelete={onHistoryDelete}
        onOpenDraft={onHistoryOpenDraft}
        onUseDraft={onHistoryUseDraft}
        onClearSent={onHistoryClearSent}
        onClearDrafts={onHistoryClearDrafts}
        onCancelQueue={onHistoryCancelQueue}
      />
    </div>
  );
}