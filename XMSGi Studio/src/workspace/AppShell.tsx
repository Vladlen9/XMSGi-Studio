import { useEffect, useState, type PropsWithChildren } from 'react';
import { CircleUserRound, FileText, LogOut, X } from 'lucide-react';
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
  browserDraftMode?: boolean;
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
  const [accountAvatarDataUrl, setAccountAvatarDataUrl] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySourceFilterOnOpen, setHistorySourceFilterOnOpen] = useState<'personal' | undefined>();
  useEffect(() => {
    let active = true;

    if (!connected || typeof window.telegram?.getAccountAvatar !== 'function') {
      setAccountAvatarDataUrl('');
      return;
    }

    window.telegram.getAccountAvatar()
      .then((result) => {
        if (active) setAccountAvatarDataUrl(result.success ? result.avatarDataUrl || '' : '');
      })
      .catch(() => {
        if (active) setAccountAvatarDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [connected]);

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

            <button
              type="button"
              className="topbar-logout-photo"
              aria-haspopup="dialog"
              aria-label={t('auth.logout')}
              title={t('auth.logout')}
              onClick={() => setIsConfirmingLogout(true)}
              disabled={authBusy}
            >
              {accountAvatarDataUrl ? (
                <img className="topbar-logout-photo-image" src={accountAvatarDataUrl} alt="" />
              ) : (
                <span className="topbar-logout-photo-fallback" aria-hidden="true">
                  <CircleUserRound size={19} strokeWidth={1.7} />
                </span>
              )}
              <span className="topbar-logout-photo-ring" aria-hidden="true" />
            </button>
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
      {isConfirmingLogout && (
        <div
          className="topbar-logout-modal-backdrop"
          onClick={() => {
            if (!authBusy) {
              setIsConfirmingLogout(false);
            }
          }}
        >
          <div
            className="topbar-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('auth.signOut')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="topbar-logout-modal-close"
              onClick={() => setIsConfirmingLogout(false)}
              disabled={authBusy}
              aria-label={t('common.close')}
            >
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span className="topbar-logout-modal-icon" aria-hidden="true">
              <LogOut size={24} strokeWidth={1.8} />
            </span>
            <h2 className="topbar-logout-modal-title">{t('auth.signOut')}</h2>
            <p className="topbar-logout-modal-description">{t('auth.signOutPreference')}</p>
            <div className="topbar-logout-modal-actions">
              <button
                type="button"
                className="topbar-logout-modal-action topbar-logout-modal-action--cancel"
                onClick={() => setIsConfirmingLogout(false)}
                disabled={authBusy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="topbar-logout-modal-action topbar-logout-modal-action--confirm"
                onClick={handleDisconnect}
                disabled={authBusy}
              >
                {t('auth.rememberMe')}
              </button>
              <button
                type="button"
                className="topbar-logout-modal-action topbar-logout-modal-action--confirm"
                onClick={handleForgetAccount}
                disabled={authBusy}
              >
                {t('auth.forgetMe')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}