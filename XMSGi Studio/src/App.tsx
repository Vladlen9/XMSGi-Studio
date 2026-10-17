import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useChats, useNotifications, useScheduler, useTelegramAuth } from './core';
import type { Chat, RichTextEntity } from '@/types';
import type { PersistedDraftStore, SavedDraft, ScheduledMessage as StudioScheduledMessage } from '@shared/types';
import { createStudioSchedulerRuntime } from '@shared/bridge';
import type { StudioPlannerTextPayload } from '@shared/bridge';

import { AppShell, StudioMount } from './workspace';
import { hasPlannerPayloadContent } from './workspace/plannerText';
import { getPlannerSurface } from './workspace/plannerSurface';
import { normalizePlannerDraft, normalizeSavedPlannerDraft, normalizeScheduledMessages } from './workspace/historyModel';
import type { HistoryItem, HistorySource } from './workspace/historyModel';
import { QuickPlannerPage } from './components/QuickPlannerPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  readPlannerDraft,
  readPlannerDraftAttachments,
  readPlannerDraftEntities,
  readPlannerDraftUpdatedAt,
  readSavedPlannerDrafts,
  writePlannerDraft,
  writeSavedPlannerDrafts,
  SAVED_PLANNER_DRAFTS_UPDATED_EVENT,
} from './lib/plannerDraft';
import { getInitialProductView, type ProductView } from './lib/productView';

type AppRoute = '/' | '/settings';
type DraftStorageWindow = Window & {
  draftStorage?: {
    load: () => Promise<{ success: boolean; store?: PersistedDraftStore }>;
    save: (store: PersistedDraftStore) => Promise<{ success: boolean }>;
  };
};

function getCurrentHashPath(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '').trim();
  const path = hash ? (hash.startsWith('/') ? hash : `/${hash}`) : '/';

  if (path === '/settings') {
    return path;
  }

  return '/';
}

function App() {
  const browserDraftMode = typeof window.telegram?.login !== 'function';
  const [message, setMessageState] = useState(readPlannerDraft);
  const messageRef = useRef(message);
  messageRef.current = message;
  const [messageEntities, setMessageEntitiesState] = useState(readPlannerDraftEntities);
  const messageEntitiesRef = useRef(messageEntities);
  messageEntitiesRef.current = messageEntities;
  const [plannerAttachments, setPlannerAttachmentsState] = useState(readPlannerDraftAttachments);
  const plannerAttachmentsRef = useRef(plannerAttachments);
  plannerAttachmentsRef.current = plannerAttachments;
  const setMessage = useCallback((nextMessage: React.SetStateAction<string>) => {
    const resolvedMessage = typeof nextMessage === 'function'
      ? nextMessage(messageRef.current)
      : nextMessage;
    messageRef.current = resolvedMessage;
    writePlannerDraft(resolvedMessage, messageEntitiesRef.current, plannerAttachmentsRef.current);
    setMessageState(resolvedMessage);
  }, []);
  const setMessageEntities = useCallback((nextEntities: RichTextEntity[]) => {
    messageEntitiesRef.current = nextEntities;
    writePlannerDraft(messageRef.current, nextEntities, plannerAttachmentsRef.current);
    setMessageEntitiesState(nextEntities);
  }, []);
  const setPlannerAttachments = useCallback((nextAttachments: string[]) => {
    plannerAttachmentsRef.current = nextAttachments;
    writePlannerDraft(messageRef.current, messageEntitiesRef.current, nextAttachments);
    setPlannerAttachmentsState(nextAttachments);
  }, []);
  const [savedPlannerDraftRevision, setSavedPlannerDraftRevision] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(getCurrentHashPath());
  const [productView, setProductView] = useState<ProductView>(() => getInitialProductView(browserDraftMode));
  const [welcomeBackInProgress, setWelcomeBackInProgress] = useState(false);
  const settingsReturnViewRef = useRef<ProductView | null>(null);
  const [activeAccountId] = useState<'account-1' | 'account-2'>(() => 'account-1');
  const [telegramApiId, setTelegramApiId] = useState('');
  const [telegramApiHash, setTelegramApiHash] = useState('');
  const [telegramCredentialsBusy, setTelegramCredentialsBusy] = useState(false);
  const [telegramCredentialsError, setTelegramCredentialsError] = useState('');
  const [telegramCredentials, setTelegramCredentials] = useState({
    hasCredentials: false,
    hasSession: false,
    connected: false,
    signedOut: false,
  });

  useEffect(() => {
    const updateSavedPlannerDrafts = () => setSavedPlannerDraftRevision((revision) => revision + 1);
    window.addEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, updateSavedPlannerDrafts);
    return () => window.removeEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, updateSavedPlannerDrafts);
  }, []);

  const {
    notification,
    showNotification,
    closeNotification,
  } = useNotifications();
  const studioNotifications = useNotifications();
  const [studioMessage, setStudioMessage] = useState('');
  const studioDraftOpenerRef = useRef<((draft: SavedDraft) => void) | null>(null);
  const studioDraftUseRef = useRef<((draft: SavedDraft) => void) | null>(null);
  const studioDraftClearerRef = useRef<(() => Promise<boolean>) | null>(null);
  const studioDraftDeleterRef = useRef<((draftId: string) => Promise<boolean>) | null>(null);
  const studioHistoryReschedulerRef = useRef<((message: StudioScheduledMessage) => void) | null>(null);
  const studioPlannerTextOpenerRef = useRef<((payload: StudioPlannerTextPayload) => Promise<boolean>) | null>(null);
  const pendingPlannerTextRef = useRef<StudioPlannerTextPayload | null>(null);
  const [studioPlannerTextOpenerVersion, setStudioPlannerTextOpenerVersion] = useState(0);
  const registerPlannerTextOpener = useCallback((opener: ((payload: StudioPlannerTextPayload) => Promise<boolean>) | null) => {
    studioPlannerTextOpenerRef.current = opener;
    setStudioPlannerTextOpenerVersion((version) => version + 1);
  }, []);
  const registerHistoryDraftOpener = useCallback((opener: ((draft: SavedDraft) => void) | null) => {
    studioDraftOpenerRef.current = opener;
  }, []);
  const registerHistoryDraftUseHandler = useCallback((handler: ((draft: SavedDraft) => void) | null) => {
    studioDraftUseRef.current = handler;
  }, []);
  const registerHistoryRescheduleHandler = useCallback((handler: ((message: StudioScheduledMessage) => void) | null) => {
    studioHistoryReschedulerRef.current = handler;
  }, []);
  const registerHistoryDraftClearHandler = useCallback((handler: (() => Promise<boolean>) | null) => {
    studioDraftClearerRef.current = handler;
  }, []);

  const registerHistoryDraftDeleteHandler = useCallback((handler: ((draftId: string) => Promise<boolean>) | null) => {
    studioDraftDeleterRef.current = handler;
  }, []);

  const chatsApiRef = useRef<{
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setSelectedChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  } | null>(null);

  const {
    connected,
    signedOut,
    returningUserName,
    returningUserUsername,
    connecting,
    connectionResolved,
    authStep,
    showAuthForm,
    phoneNumber,
    phoneCode,
    twoFactorPassword,
    authBusy,
    authError,
    telegramStatus,
    isConfirmingLogout,
    setIsConfirmingLogout,
    setShowAuthForm,
    setAuthStep,
    setPhoneNumber,
    setPhoneCode,
    setTwoFactorPassword,
    setAuthError,
    handleTelegramAuth,
    handleDisconnect,
    handleWelcomeBack,
    handleForgetAccount,
  } = useTelegramAuth({
    showNotification,
    setIsSettingsOpen,
    setChats: (value) => {
      chatsApiRef.current?.setChats(value);
    },
    setSelectedChat: (value) => {
      chatsApiRef.current?.setSelectedChat(value);
    },
  });

  useLayoutEffect(() => {
    if (connectionResolved && !connected) {
      setProductView('planner');
    }
  }, [connected, connectionResolved, setProductView]);

  const {
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    selectedChatPermissions,
    refreshChatPermissions,
    handleAddChat,
    handleRemoveChat,
  } = useChats({ connected });

  useEffect(() => {
    chatsApiRef.current = {
      setChats,
      setSelectedChat,
    };
  }, [setChats, setSelectedChat]);

  const {
    upcoming: personalUpcoming,
    sent: personalSent,
    scheduling: personalScheduling,
    publishingDraft: personalPublishingDraft,
    handleSchedule: handlePersonalSchedule,
    handleCancelMessage: handlePersonalCancelMessage,
    handleCancelMessages: handlePersonalCancelMessages,
    handleSendNow: handlePersonalSendNow,
    handleSendDraftNow: handlePersonalSendDraftNow,
    handleDeleteMessage: handlePersonalDeleteMessage,
    handleClearSent: handlePersonalClearSent,
  } = useScheduler({
    historyScope: 'personal',
    connected,
    selectedChat,
    refreshChatPermissions,
    chats,
    message,
    composerAttachments: plannerAttachments,
    composerEntities: messageEntities,
    showNotification,
    setMessage,
  });

  const studioScheduler = useScheduler({
    historyScope: 'workspace',
    accountId: activeAccountId,
    connected: connected && !signedOut && activeAccountId === 'account-1',
    selectedChat,
    refreshChatPermissions,
    chats,
    message: studioMessage,
    showNotification: studioNotifications.showNotification,
    setMessage: setStudioMessage,
  });

  const studioBridgeScheduler = createStudioSchedulerRuntime(
    studioScheduler,
    studioNotifications.notification,
    studioNotifications.closeNotification,
  );

  const openPlannerTextInStudio = async (payload: StudioPlannerTextPayload) => {
    if (!hasPlannerPayloadContent(payload)) {
      showNotification('Add text or an attachment before opening Studio.', 'warning', 'Nothing to open');
      return;
    }
    if (pendingPlannerTextRef.current !== null) return;

    pendingPlannerTextRef.current = {
      text: payload.text,
      attachments: [...payload.attachments],
      entities: payload.entities.map((entity) => ({ ...entity })),
    };
    setProductView('studio');
  };

  useEffect(() => {
    if (productView !== 'studio' || pendingPlannerTextRef.current === null) return;
    const pendingText = pendingPlannerTextRef.current;
    const opener = studioPlannerTextOpenerRef.current;
    if (!opener) {
      const timeout = window.setTimeout(() => {
        if (pendingPlannerTextRef.current !== pendingText) return;
        pendingPlannerTextRef.current = null;
        showNotification('Studio did not finish loading. Planner text is unchanged.', 'error', 'Could not open Studio');
      }, 10000);
      return () => window.clearTimeout(timeout);
    }

    pendingPlannerTextRef.current = null;
    try {
      void opener(pendingText).then((opened) => {
        if (!opened) {
          showNotification(
            'Studio could not preserve its current document. Planner text was not opened.',
            'warning',
            'Document not replaced',
          );
        }
      }).catch(() => {
        showNotification('Studio could not open the Planner text. Your Planner text is unchanged.', 'error', 'Could not open Studio');
      });
    } catch {
      showNotification('Studio could not open the Planner text. Your Planner text is unchanged.', 'error', 'Could not open Studio');
    }
  }, [productView, showNotification, studioPlannerTextOpenerVersion]);

  const plannerDraftRecord = normalizePlannerDraft(message, selectedChat, readPlannerDraftUpdatedAt(), messageEntities, plannerAttachments);
  const savedPlannerDraftRecords = useMemo(
    () => readSavedPlannerDrafts().map(normalizeSavedPlannerDraft),
    [savedPlannerDraftRevision],
  );
  const personalSentHistoryRecords = useMemo(
    () => normalizeScheduledMessages(personalSent, 'personal', 'sent', chats),
    [chats, personalSent],
  );
  const historyRecords = [
    ...normalizeScheduledMessages(personalUpcoming, 'personal', 'upcoming', chats),
    ...personalSentHistoryRecords,
    ...normalizeScheduledMessages(studioScheduler.upcoming, 'workspace', 'upcoming', chats),
    ...normalizeScheduledMessages(studioScheduler.sent, 'workspace', 'sent', chats),
    ...(plannerDraftRecord ? [plannerDraftRecord] : []),
    ...savedPlannerDraftRecords,
  ];
  const cancelHistoryRecord = (record: HistoryItem) => {
    if (record.original.kind !== 'scheduled' || record.status !== 'scheduled') return;
    if (record.source === 'workspace') {
      studioScheduler.handleCancelMessage(record.original.message);
    } else {
      handlePersonalCancelMessage(record.original.message);
    }
  };

  const sendHistoryRecordNow = (record: HistoryItem) => {
    if (record.original.kind !== 'scheduled') return;
    if (record.source === 'workspace') {
      studioScheduler.handleSendNow(record.original.message);
    } else {
      handlePersonalSendNow(record.original.message);
    }
  };

  const rescheduleHistoryRecord = (record: HistoryItem) => {
    if (record.source !== 'workspace' || record.original.kind !== 'scheduled' || record.status !== 'scheduled') return;
    setProductView('studio');
    studioHistoryReschedulerRef.current?.({ ...record.original.message, status: 'scheduled' });
  };

  const clearHistorySent = (source: HistorySource | 'all') => {
    if (source === 'all') {
      studioScheduler.handleClearSent();
      handlePersonalClearSent();
      return;
    }
    if (source === 'workspace') studioScheduler.handleClearSent();
    else handlePersonalClearSent();
  };

  const clearHistoryDrafts = async (source: HistorySource | 'all') => {
    if (source === 'all' || source === 'workspace') {
      const studioDraftClearer = studioDraftClearerRef.current;
      if (studioDraftClearer) {
        if (!await studioDraftClearer()) return false;
      } else {
        const draftStorage = (window as DraftStorageWindow).draftStorage;
        if (!draftStorage) return false;
        try {
          const loaded = await draftStorage.load();
          if (!loaded.success || !loaded.store) return false;
          const saved = await draftStorage.save({ ...loaded.store, savedDrafts: [] });
          if (!saved.success) return false;
        } catch {
          return false;
        }
      }
    }
    if (source === 'all' || source === 'personal') {
      if (!writeSavedPlannerDrafts([])) return false;
      setMessage('');
      setMessageEntities([]);
      setPlannerAttachments([]);
    }
    return true;
  };

  const cancelHistoryQueue = async (records: HistoryItem[]) => {
    const personalMessages = records.flatMap((record) => record.source === 'personal' && record.original.kind === 'scheduled' ? [record.original.message] : []);
    const workspaceMessages = records.flatMap((record) => record.source === 'workspace' && record.original.kind === 'scheduled' ? [record.original.message] : []);
    const results = await Promise.all([
      personalMessages.length ? handlePersonalCancelMessages(personalMessages) : true,
      workspaceMessages.length ? studioScheduler.handleCancelMessages(workspaceMessages) : true,
    ]);
    return results.every(Boolean);
  };

  const deleteHistoryRecord = (record: HistoryItem): void | Promise<boolean> => {
    if (record.original.kind === 'saved-draft') return studioDraftDeleterRef.current?.(record.original.draft.id);
    if (record.original.kind === 'saved-planner-draft') {
      const savedDraftId = record.original.draft.id;
      const remainingDrafts = readSavedPlannerDrafts().filter(({ id }) => id !== savedDraftId);
      return Promise.resolve(writeSavedPlannerDrafts(remainingDrafts));
    }
    if (record.original.kind === 'planner-draft') {
      setMessage('');
      setMessageEntities([]);
      setPlannerAttachments([]);
      return Promise.resolve(true);
    }
    const message = record.original.message;
    const normalizedChatName = message.chatName.trim().toLocaleLowerCase();
    const isSavedMessagesChat = normalizedChatName === 'saved messages' || normalizedChatName === 'сохранённые сообщения';
    const telegramMessageIds = [...new Set([
        message.telegramMessageId,
        ...(message.telegramMessageIds ?? []),
      ].filter((id): id is string | number => id !== undefined && id !== null).map(String))];
    if (record.source === 'personal' && record.status === 'sent' && isSavedMessagesChat && telegramMessageIds.length > 0) {
      return Promise.all(telegramMessageIds.map((messageId) => window.telegram.deleteSavedMessage({
        chatId: message.chatId,
        messageId,
      }))).then((results) => {
        if (results.some((result) => !result.success)) return false;
        handlePersonalDeleteMessage(message, true);
        return true;
      });
    }
    if (!['sent', 'failed', 'cancelled'].includes(record.status)) return;
    if (record.source === 'workspace') {
      studioScheduler.handleDeleteMessage(message, true);
    } else {
      handlePersonalDeleteMessage(message, true);
    }
  };

  const openHistoryDraft = (record: HistoryItem) => {
    setProductView(record.source === 'workspace' ? 'studio' : 'planner');
    if (record.original.kind === 'saved-draft') {
      studioDraftOpenerRef.current?.(record.original.draft);
    } else if (record.original.kind === 'planner-draft') {
      setMessageEntities(record.original.entities);
      setMessage(record.original.text);
      setPlannerAttachments([]);
    } else if (record.original.kind === 'saved-planner-draft') {
      setMessageEntities(record.original.draft.entities);
      setPlannerAttachments(record.original.draft.attachments);
      setMessage(record.original.draft.message);
    }
  };

  const useHistoryDraft = (record: HistoryItem, destination?: 'planner' | 'studio') => {
    if (record.original.kind === 'saved-draft') {
      setProductView('studio');
      studioDraftUseRef.current?.(record.original.draft);
      return;
    }

    const plannerPayload = record.original.kind === 'planner-draft'
      ? { text: record.original.text, attachments: record.original.attachments, entities: record.original.entities }
      : record.original.kind === 'saved-planner-draft'
        ? { text: record.original.draft.message, attachments: record.original.draft.attachments, entities: record.original.draft.entities }
        : null;
    if (!plannerPayload) return;

    if (destination === 'studio') {
      void openPlannerTextInStudio(plannerPayload);
      return;
    }

    setProductView('planner');
    setMessageEntities(plannerPayload.entities);
    setPlannerAttachments(plannerPayload.attachments);
    setMessage(plannerPayload.text);
  };

  const studioConnected = connected && !signedOut && activeAccountId === 'account-1';
  const plannerSurface = getPlannerSurface({
    browserDraftMode,
    connected,
    signedOut,
    connecting,
    connectionResolved,
    welcomeBackInProgress,
  });
  const studioSurfaceVisible = productView === 'studio'
    && (browserDraftMode || (connectionResolved && connected && !signedOut));

  useEffect(() => {
    if (isSettingsOpen) {
      setIsConfirmingLogout(false);
    }
  }, [isSettingsOpen, setIsConfirmingLogout]);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getCurrentHashPath());
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (route === '/settings') {
      if (settingsReturnViewRef.current === null) {
        settingsReturnViewRef.current = productView;
      }
      setIsSettingsOpen(true);
      setProductView('planner');
    } else {
      setIsSettingsOpen(false);
      const returnView = settingsReturnViewRef.current;
      if (returnView !== null) {
        settingsReturnViewRef.current = null;
        setProductView(returnView);
      }
    }
  }, [productView, route]);

  const navigate = (nextRoute: AppRoute) => {
    const target = nextRoute === '/' ? '#/' : `#${nextRoute}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
    setRoute(nextRoute);
  };

  const closeSettings = () => {
    setShowAuthForm(false);
    setIsSettingsOpen(false);
    navigate('/');
  };

  const finishWelcomeBack = async () => {
    if (typeof window.telegram?.getAuthState !== 'function') return false;

    try {
      const authResult = await window.telegram.getAuthState();
      if (!authResult.success || !authResult.authState?.connected || authResult.authState.signedOut) return false;
      setProductView('studio');
      settingsReturnViewRef.current = 'studio';
      return true;
    } catch {
      return false;
    }
  };

  const openCredentialSettingsIfMissing = async () => {
    if (typeof window.telegram?.getConfig !== 'function') return;

    try {
      const configResult = await window.telegram.getConfig();
      if (configResult.success && configResult.config && !configResult.config.hasCredentials) {
        navigate('/settings');
      }
    } catch {
      return;
    }
  };

  const handleWelcomeBackFromReturn = async () => {
    setWelcomeBackInProgress(true);
    let restored = false;
    try {
      restored = await handleWelcomeBack(() => setProductView('studio'));
    } finally {
      setWelcomeBackInProgress(false);
    }
    if (restored) return;
    if (await finishWelcomeBack()) return;
    if (typeof window.telegram?.getConfig !== 'function') return;

    try {
      const configResult = await window.telegram.getConfig();
      if (configResult.success && configResult.config
        && (!configResult.config.hasCredentials || !configResult.config.hasSession)) {
        navigate('/settings');
      }
    } catch {
      return;
    }
  };

  const handleWelcomeBackFromSettings = async () => {
    const restored = await handleWelcomeBack();
    if (restored) {
      // Запомним Studio как вид для возврата: useLayoutEffect переключит
      // productView до первой отрисовки после navigate('/'), без мигания.
      settingsReturnViewRef.current = 'studio';
      navigate('/');
      return;
    }
    if (await finishWelcomeBack()) navigate('/');
  };

  const handleTelegramAuthFromLogin = async () => {
    const signedIn = await handleTelegramAuth();
    if (signedIn) {
      setProductView('studio');
      return;
    }
    await openCredentialSettingsIfMissing();
  };

  const handleTelegramAuthFromSettings = async () => {
    const signedIn = await handleTelegramAuth();
    if (signedIn) {
      settingsReturnViewRef.current = 'studio';
      navigate('/');
      return;
    }
    if (await finishWelcomeBack()) navigate('/');
  };

  const renderSettingsPage = () => (
    <SettingsPage
      onClose={closeSettings}
      accountName={returningUserName}
      telegramUsername={returningUserUsername}
      telegramConnected={connected && !signedOut}
      telegramConnecting={connecting}
      telegramAuthStep={authStep}
      telegramPhoneNumber={phoneNumber}
      telegramPhoneCode={phoneCode}
      telegramTwoFactorPassword={twoFactorPassword}
      telegramAuthBusy={authBusy}
      telegramAuthError={authError}
      telegramStatus={telegramStatus}
      telegramCredentials={telegramCredentials}
      telegramApiId={telegramApiId}
      telegramApiHash={telegramApiHash}
      telegramCredentialsBusy={telegramCredentialsBusy}
      telegramCredentialsError={telegramCredentialsError}
      onTelegramApiIdChange={setTelegramApiId}
      onTelegramApiHashChange={setTelegramApiHash}
      onTelegramPhoneNumberChange={setPhoneNumber}
      onTelegramPhoneCodeChange={setPhoneCode}
      onTelegramTwoFactorPasswordChange={setTwoFactorPassword}
      onTelegramAuth={handleTelegramAuthFromSettings}
      onTelegramReconnect={handleWelcomeBackFromSettings}
      onTelegramDisconnect={handleDisconnect}
      onSaveTelegramCredentials={async () => {
        setTelegramCredentialsBusy(true);
        setTelegramCredentialsError('');
        try {
          const result = await window.telegram.saveCredentials({
            API_ID: telegramApiId.trim(),
            API_HASH: telegramApiHash.trim(),
          });
          if (!result.success || !result.config || !result.config.hasCredentials) {
            throw new Error(result.error || 'Telegram API credentials could not be saved.');
          }
          setTelegramCredentials({
            hasCredentials: Boolean(result.config.hasCredentials),
            hasSession: Boolean(result.config.hasSession),
            connected: Boolean(result.config.connected),
            signedOut: Boolean(result.config.signedOut),
          });
          setTelegramApiId('');
          setTelegramApiHash('');
        } catch (error) {
          setTelegramCredentialsError(error instanceof Error ? error.message : 'Telegram API credentials could not be saved.');
        } finally {
          setTelegramCredentialsBusy(false);
        }
      }}
    />
  );

  useEffect(() => {
    let active = true;
    if (typeof window.telegram?.getConfig !== 'function') return;
    window.telegram.getConfig().then((result) => {
      if (!active || !result.success || !result.config) return;
      setTelegramCredentials({
        hasCredentials: Boolean(result.config.hasCredentials),
        hasSession: Boolean(result.config.hasSession),
        connected: Boolean(result.config.connected),
        signedOut: Boolean(result.config.signedOut),
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [connected, signedOut]);

  return (
    <AppShell
      view={productView}
      browserDraftMode={browserDraftMode}
      onViewChange={(view) => {
        if (view !== 'studio') pendingPlannerTextRef.current = null;
        setProductView(view);
      }}
      settingsOpen={route === '/settings'}
      onCloseSettings={closeSettings}
      connected={connected && !signedOut}
      headerPending={connecting || !connectionResolved}
      authBusy={authBusy}
      isConfirmingLogout={isConfirmingLogout}
      setIsConfirmingLogout={setIsConfirmingLogout}
      setShowAuthForm={setShowAuthForm}
      handleDisconnect={async () => {
        await handleDisconnect();
        if (typeof window.telegram?.getAuthState === 'function') {
          const authResult = await window.telegram.getAuthState();
          if (authResult.success && authResult.authState?.signedOut) {
            setProductView('planner');
          }
        }
      }}
      handleForgetAccount={handleForgetAccount}
      onOpenSettings={() => {
        setShowAuthForm(false);
        setIsConfirmingLogout(false);
        setIsSettingsOpen(true);
        navigate('/settings');
      }}
      historyRecords={historyRecords}
      onHistoryCancel={cancelHistoryRecord}
      onHistoryReschedule={rescheduleHistoryRecord}
      onHistorySendNow={sendHistoryRecordNow}
      onHistoryDelete={deleteHistoryRecord}
      onHistoryOpenDraft={openHistoryDraft}
      onHistoryUseDraft={useHistoryDraft}
      onHistoryClearSent={clearHistorySent}
      onHistoryClearDrafts={clearHistoryDrafts}
      onHistoryCancelQueue={cancelHistoryQueue}
    >
      <div className={`product-view ${studioSurfaceVisible ? 'is-active' : ''}`} aria-hidden={!studioSurfaceVisible}>
        {studioSurfaceVisible ? (
          <StudioMount
            connected={studioConnected}
            activeAccountId={activeAccountId}
            chats={studioConnected ? chats : []}
            selectedChat={selectedChat}
            onSelectChat={setSelectedChat}
            scheduler={studioBridgeScheduler}
            onRegisterPlannerTextOpener={registerPlannerTextOpener}
            onRegisterHistoryDraftOpener={registerHistoryDraftOpener}
            onRegisterHistoryDraftUseHandler={registerHistoryDraftUseHandler}
            onRegisterHistoryDraftClearHandler={registerHistoryDraftClearHandler}
            onRegisterHistoryDraftDeleteHandler={registerHistoryDraftDeleteHandler}
            onRegisterHistoryRescheduleHandler={registerHistoryRescheduleHandler}
          />
        ) : null}
      </div>
      <div className={`product-view ${productView === 'planner' ? 'is-active' : ''}`} aria-hidden={productView !== 'planner'}>
        {route === '/settings' ? renderSettingsPage() : (
          plannerSurface === 'pending' ? null : plannerSurface === 'quick' ? (
            <QuickPlannerPage
              draftOnlyMode={browserDraftMode}
              chats={chats}
              selectedChat={selectedChat}
              selectedChatPermissions={selectedChatPermissions}
              onSelectChat={setSelectedChat}
              onAddChat={handleAddChat}
              onRemoveChat={handleRemoveChat}
              onChatPickerError={(text, title) => showNotification(text, 'error', title)}
              message={message}
              onMessageChange={setMessage}
              entities={messageEntities}
              onEntitiesChange={setMessageEntities}
              attachments={plannerAttachments}
              onAttachmentsChange={setPlannerAttachments}
              upcoming={personalUpcoming}
              sentHistory={personalSentHistoryRecords}
              isSending={personalPublishingDraft}
              isScheduling={personalScheduling}
              onSendNow={async (text, attachments, entities) => {
                if (!selectedChat) return false;
                return handlePersonalSendDraftNow(
                  selectedChat,
                  text,
                  attachments,
                  entities,
                  undefined,
                  false,
                  undefined,
                  { clearMessageOnSuccess: false },
                );
              }}
              onSchedule={handlePersonalSchedule}
              onSaveDraft={(text, attachments, entities) => {
                setMessageEntities(entities);
                setPlannerAttachments(attachments);
                setMessage(text);
                showNotification('Draft saved on this device.', 'success', 'Draft saved');
              }}
              onOpenInStudio={openPlannerTextInStudio}
              notification={notification}
              closeNotification={closeNotification}
            />
          ) : <LoginPage
            connecting={connecting}
            notification={notification}
            closeNotification={closeNotification}
            signedOut={signedOut}
            returningUserName={returningUserName}
            returningUserUsername={returningUserUsername}
            authStep={authStep}
            showAuthForm={showAuthForm}
            phoneNumber={phoneNumber}
            phoneCode={phoneCode}
            twoFactorPassword={twoFactorPassword}
            authBusy={authBusy}
            authError={authError}
            setShowAuthForm={setShowAuthForm}
            setAuthStep={setAuthStep}
            setPhoneNumber={setPhoneNumber}
            setPhoneCode={setPhoneCode}
            setTwoFactorPassword={setTwoFactorPassword}
            setAuthError={setAuthError}
            handleTelegramAuth={handleTelegramAuthFromLogin}
            handleWelcomeBack={handleWelcomeBackFromReturn}
          />
        )}
      </div>
    </AppShell>
  );
}

export default App;