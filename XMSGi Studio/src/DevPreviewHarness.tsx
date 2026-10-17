import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chat, NotificationState, RichTextEntity, ScheduledMessage } from '@/types';
import type { SavedDraft, ScheduledMessage as StudioScheduledMessage } from '@shared/types';
import { BRIDGE_PROTOCOL_VERSION } from '@shared/bridge';
import type { StudioPlannerTextPayload, StudioSchedulerRuntime } from '@shared/bridge';
import { AppShell, StudioMount } from './workspace';
import { QuickPlannerPage } from './components/QuickPlannerPage';
import { SettingsPage } from './pages/SettingsPage';
import { hasPlannerPayloadContent } from './workspace/plannerText';
import { writePlannerDraft } from './lib/plannerDraft';
import { normalizePlannerDraft, normalizeSavedDraft, normalizeScheduledMessages } from './workspace/historyModel';
import type { HistoryItem } from './workspace/historyModel';

const DRAFT_STORE_SCHEMA_VERSION = 1;

const demoChats: Chat[] = [
  { id: 'dev-saved', name: 'Saved Messages', type: 'private' },
  { id: 'dev-group', name: 'Studio Team', username: 'studio_team', type: 'group' },
  { id: 'dev-channel', name: 'XMSGi Updates', username: 'xmsgi_updates', type: 'channel' },
];

const demoHistoryMessages: ScheduledMessage[] = [
  {
    id: 'history-launch-1',
    chatId: 'dev-channel',
    chatName: 'XMSGi Updates',
    text: 'Короткий анонс: подготовили обновление редактора и новые шаблоны публикаций.',
    attachments: [new URL('../screenshots/03.png', import.meta.url).href],
    replyMarkup: { inline_keyboard: [[{ text: 'Подробнее', url: 'https://example.com' }]] },
    when: '2026-10-04T09:30:00.000Z',
    createdAt: '2026-10-03T12:00:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'history-team-1',
    chatId: 'dev-group',
    chatName: 'Studio Team',
    text: 'Собираемся на короткий созвон по плану публикаций. Добавьте заметки к задачам заранее.',
    attachments: [],
    when: '2026-10-04T11:00:00.000Z',
    createdAt: '2026-10-03T12:15:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'history-saved-1',
    chatId: 'dev-saved',
    chatName: 'Saved Messages',
    text: 'Проверить финальные ссылки и подготовить изображение для следующего поста.',
    attachments: [],
    when: '2026-10-05T08:15:00.000Z',
    createdAt: '2026-10-03T12:30:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'history-team-2',
    chatId: 'dev-group',
    chatName: 'Studio Team',
    text: 'Итоги недели и список тем на следующую неделю.',
    attachments: [],
    when: '2026-10-05T14:00:00.000Z',
    createdAt: '2026-10-03T12:45:00.000Z',
    status: 'confirmed',
  },
];
const demoHistoryRecords = [
  ...normalizeScheduledMessages(demoHistoryMessages, 'workspace', 'upcoming', demoChats),
  normalizePlannerDraft(
    'Черновик Quick Planner: идеи для следующей публикации.',
    demoChats[0],
    '2026-10-12T09:30:00.000Z',
  ),
  ...normalizeScheduledMessages([{
    id: 'history-failed-1',
    chatId: 'dev-channel',
    chatName: 'XMSGi Updates',
    text: 'Повторить публикацию после проверки доступа к каналу.',
    attachments: [],
    when: '2026-10-06T10:00:00.000Z',
    createdAt: '2026-10-03T13:00:00.000Z',
    status: 'failed' as ScheduledMessage['status'],
    lastError: 'Telegram не подтвердил отправку.',
    retryAction: 'send',
  }], 'workspace', 'upcoming', demoChats),
  ...normalizeScheduledMessages([{
    id: 'history-sent-1',
    chatId: 'dev-group',
    chatName: 'Studio Team',
    text: Array.from({ length: 12 }, (_, index) => `Итоги публикации, раздел ${index + 1}: команда согласовала результат, проверила ссылки и сохранила заметки для следующего цикла. Подробности доступны в приложенном файле.`).join('\n\n'),
    attachments: ['C:\\demo\\weekly-summary.pdf'],
    when: '2026-10-02T15:45:00.000Z',
    sentAt: '2026-10-02T15:45:00.000Z',
    createdAt: '2026-10-02T10:00:00.000Z',
    status: 'sent',
  }], 'personal', 'sent', demoChats),
  normalizeSavedDraft({
    id: 'history-draft-1',
    name: 'Идея для следующего поста',
    body: 'Собрать заметки о новых возможностях Studio и добавить короткий пример.',
    color: 'teal',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-03T13:20:00.000Z',
    selectedChat: demoChats[2],
  }),
].filter((record): record is HistoryItem => record !== null);
const previewParams = new URLSearchParams(window.location.search);
const showPlannerPreview = previewParams.get('devPreview') === 'planner';
const showHistoryPreview = previewParams.get('historyPreview') !== '0';

const DEV_DRAFT_STORE_KEY = 'xmsgi-draft-store-fallback';
const emptyNotification: NotificationState = { message: '', title: '', type: 'info', visible: false };
const noOperation = () => {};

try {
  const hasDraftFallback = window.localStorage.getItem(DEV_DRAFT_STORE_KEY)
    || window.localStorage.getItem('awaitmsg-draft-store-fallback');
  if (!hasDraftFallback) {
    window.localStorage.setItem(DEV_DRAFT_STORE_KEY, JSON.stringify({
      schemaVersion: DRAFT_STORE_SCHEMA_VERSION,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: null,
    }));
  }
} catch {
  // Keep the dev preview usable if browser storage is unavailable.
}
const demoScheduler: StudioSchedulerRuntime = {
  protocolVersion: BRIDGE_PROTOCOL_VERSION,
  upcoming: demoHistoryMessages,
  sent: [],
  scheduling: false,
  successPulse: false,
  lastAction: null,
  revealingId: null,
  cancelingIds: new Set(),
  sendingIds: new Set(),
  publishingDraft: false,
  notification: emptyNotification,
  closeNotification: noOperation,
  handleSchedule: noOperation,
  handleSendDraftNow: async () => false,
  handleSendNow: noOperation,
  handleDeleteMessage: noOperation,
  handleClearSent: noOperation,
  handleCancelMessage: async () => {},
  handleCancelMessages: async () => true,
};

export default function DevPreviewHarness() {
  const [view, setView] = useState<'studio' | 'planner'>(showPlannerPreview ? 'planner' : 'studio');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState('');
  const [plannerEntities, setPlannerEntities] = useState<RichTextEntity[]>([]);
  const [plannerAttachments, setPlannerAttachments] = useState<string[]>([]);
  const [plannerChats, setPlannerChats] = useState(demoChats);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(demoChats[0]);
  const [plannerUpcoming, setPlannerUpcoming] = useState(demoHistoryMessages);
  const plannerTextOpenerRef = useRef<((payload: StudioPlannerTextPayload) => Promise<boolean>) | null>(null);
  const pendingPlannerTextRef = useRef<StudioPlannerTextPayload | null>(null);
  const [plannerTextOpenerVersion, setPlannerTextOpenerVersion] = useState(0);
  const registerPlannerTextOpener = useCallback((opener: ((payload: StudioPlannerTextPayload) => Promise<boolean>) | null) => {
    plannerTextOpenerRef.current = opener;
    setPlannerTextOpenerVersion((version) => version + 1);
  }, []);
  const handlePlannerOpenInStudio = (payload: StudioPlannerTextPayload) => {
    if (!hasPlannerPayloadContent(payload) || pendingPlannerTextRef.current !== null) return;
    pendingPlannerTextRef.current = payload;
    setView('studio');
  };
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [, setShowAuthForm] = useState(false);
  const historyDraftOpenerRef = useRef<((draft: SavedDraft) => void) | null>(null);
  const historyDraftUseRef = useRef<((draft: SavedDraft) => void) | null>(null);
  const historyDraftDeleterRef = useRef<((draftId: string) => Promise<boolean>) | null>(null);
  const historyReschedulerRef = useRef<((message: StudioScheduledMessage) => void) | null>(null);
  const handleHistoryOpenDraft = (record: HistoryItem) => {
    if (record.original.kind === 'saved-draft') historyDraftOpenerRef.current?.(record.original.draft);
  };
  const handleHistoryUseDraft = (record: HistoryItem) => {
    if (record.original.kind === 'saved-draft') historyDraftUseRef.current?.(record.original.draft);
  };
  const handleHistoryDelete = (record: HistoryItem) => record.original.kind === 'saved-draft'
    ? historyDraftDeleterRef.current?.(record.original.draft.id)
    : undefined;
  const handleHistoryReschedule = (record: HistoryItem) => {
    if (record.original.kind === 'scheduled') {
      historyReschedulerRef.current?.({ ...record.original.message, status: 'scheduled' });
    }
  };

  useEffect(() => {
    if (view !== 'studio' || pendingPlannerTextRef.current === null) return;
    const opener = plannerTextOpenerRef.current;
    if (!opener) return;
    const text = pendingPlannerTextRef.current;
    pendingPlannerTextRef.current = null;
    void opener(text);
  }, [plannerTextOpenerVersion, view]);

  const previewSettingsPage = (
    <SettingsPage
      onClose={() => setIsSettingsOpen(false)}
      accountName="Preview user"
      telegramUsername="preview_user"
      telegramConnected
      telegramConnecting={false}
      telegramAuthStep="phone"
      telegramPhoneNumber=""
      telegramPhoneCode=""
      telegramTwoFactorPassword=""
      telegramAuthBusy={false}
      telegramAuthError=""
      telegramStatus={{ accountId: 'dev-preview', status: 'normal' }}
      telegramCredentials={{ hasCredentials: true, hasSession: true, connected: true, signedOut: false }}
      telegramApiId=""
      telegramApiHash=""
      telegramCredentialsBusy={false}
      telegramCredentialsError=""
      onTelegramApiIdChange={noOperation}
      onTelegramApiHashChange={noOperation}
      onSaveTelegramCredentials={noOperation}
      onTelegramPhoneNumberChange={noOperation}
      onTelegramPhoneCodeChange={noOperation}
      onTelegramTwoFactorPasswordChange={noOperation}
      onTelegramAuth={noOperation}
      onTelegramReconnect={noOperation}
      onTelegramDisconnect={noOperation}
    />
  );

  return (
    <AppShell
      view={view}
      onViewChange={setView}
      settingsOpen={isSettingsOpen}
      onCloseSettings={() => setIsSettingsOpen(false)}
      connected={true}
      authBusy={false}
      isConfirmingLogout={isConfirmingLogout}
      setIsConfirmingLogout={setIsConfirmingLogout}
      setShowAuthForm={setShowAuthForm}
      handleDisconnect={async () => {}}
      handleForgetAccount={async () => {}}
      onOpenSettings={() => setIsSettingsOpen(true)}
      historyRecords={showHistoryPreview ? demoHistoryRecords : []}
      onHistoryCancel={noOperation}
      onHistoryReschedule={handleHistoryReschedule}
      onHistorySendNow={noOperation}
      onHistoryDelete={handleHistoryDelete}
      onHistoryOpenDraft={handleHistoryOpenDraft}
      onHistoryUseDraft={handleHistoryUseDraft}
      onHistoryClearSent={noOperation}
    >
      {isSettingsOpen ? previewSettingsPage : view === 'planner' ? (
        <QuickPlannerPage
          chats={plannerChats}
          selectedChat={selectedChat}
          selectedChatPermissions={null}
          onSelectChat={setSelectedChat}
          onAddChat={(chat) => setPlannerChats((current) => (
            current.some((existing) => existing.id === chat.id) ? current : [...current, chat]
          ))}
          onRemoveChat={(chat) => setPlannerChats((current) => current.filter((item) => item.id !== chat.id))}
          message={plannerMessage}
          entities={plannerEntities}
          attachments={plannerAttachments}
          onMessageChange={(text) => {
            setPlannerMessage(text);
            writePlannerDraft(text, plannerEntities, plannerAttachments);
          }}
          onEntitiesChange={(entities) => {
            setPlannerEntities(entities);
            writePlannerDraft(plannerMessage, entities, plannerAttachments);
          }}
          onAttachmentsChange={(attachments) => {
            setPlannerAttachments(attachments);
            writePlannerDraft(plannerMessage, plannerEntities, attachments);
          }}
          upcoming={plannerUpcoming}
          isSending={false}
          isScheduling={false}
          onSendNow={async (text, attachments, _entities) => {
            if (!selectedChat || (!text.trim() && attachments.length === 0)) return false;
            setPlannerMessage('');
            setPlannerEntities([]);
            setPlannerAttachments([]);
            writePlannerDraft('', [], []);
            return true;
          }}
          onSchedule={async ({ chatId, message, date, time, attachments, entities }) => {
            const chat = demoChats.find((item) => item.id === chatId);
            if (!chat) return;
            setPlannerUpcoming((current) => [{
              id: `planner-preview-${Date.now()}`,
              chatId,
              chatName: chat.name,
              text: message,
              attachments,
              entities,
              when: new Date(`${date}T${time}`).toISOString(),
              createdAt: new Date().toISOString(),
              status: 'scheduled',
            }, ...current]);
            setPlannerMessage('');
            setPlannerEntities([]);
            setPlannerAttachments([]);
            writePlannerDraft('', [], []);
          }}
          onSaveDraft={(text, attachments, entities) => {
            setPlannerMessage(text);
            setPlannerEntities(entities);
            setPlannerAttachments(attachments);
            writePlannerDraft(text, entities, attachments);
          }}
          onOpenInStudio={handlePlannerOpenInStudio}
        />
      ) : (
        <div className="product-view is-active">
          <StudioMount
            connected={false}
            activeAccountId="account-1"
            chats={demoChats}
            selectedChat={selectedChat}
            onSelectChat={setSelectedChat}
            scheduler={demoScheduler}
            onRegisterPlannerTextOpener={registerPlannerTextOpener}
            onRegisterHistoryDraftOpener={(handler) => { historyDraftOpenerRef.current = handler; }}
            onRegisterHistoryDraftUseHandler={(handler) => { historyDraftUseRef.current = handler; }}
            onRegisterHistoryDraftDeleteHandler={(handler) => { historyDraftDeleterRef.current = handler; }}
            onRegisterHistoryRescheduleHandler={(handler) => { historyReschedulerRef.current = handler; }}
          />
        </div>
      )}
    </AppShell>
  );
}