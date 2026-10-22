import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createStudioSchedulerRuntime } from '@shared/bridge';
import type { StudioSchedulerActions } from '@shared/bridge';
import { ConfirmDialogProvider, ConfirmDialogSurface } from '../../src/components/ConfirmDialog';
import { LocaleProvider, useLocale } from '../../src/lib/i18n';
import type { ColorTheme } from '../../src/lib/colorTheme';
import { TestbenchNavigation } from '../shared/TestbenchNavigation';
import { applyTestbenchColorTheme, readTestbenchColorTheme } from '../shared/testbenchTheme';
import StudioApp from '../../src/studio/App';
import type { Chat } from '../../src/studio/types';
import './main.css';
import '../../src/index.css';
import '../../src/styles/colorThemes.css';
import '../../src/studio/pages/WorkspacePage.css';

const botFatherChat: Chat = {
  id: 'botfather',
  name: 'BotFather',
  username: 'BotFather',
  type: 'private',
};

document.documentElement.lang = 'ru';
applyTestbenchColorTheme(readTestbenchColorTheme());

type ErrorVariant =
  | 'none'
  | 'send-error'
  | 'draft-error'
  | 'attachment-error'
  | 'text-error'
  | 'chat-error'
  | 'history-error'
  | 'preview-error'
  | 'connection-error'
  | 'provider-error'
  | 'warning'
  | 'mass-warning'
  | 'progress'
  | 'success';
type ConfirmationVariant = 'none' | 'delete-draft' | 'discard-changes';

function Demo() {
  const { locale, setLocale, t } = useLocale();
  const [theme, setTheme] = useState<ColorTheme>(readTestbenchColorTheme);
  const [errorVariant, setErrorVariant] = useState<ErrorVariant>('none');
  const [confirmationVariant, setConfirmationVariant] = useState<ConfirmationVariant>('none');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(botFatherChat);
  const isRussian = locale === 'ru';
  const errorOptions: Array<{ value: ErrorVariant; label: string }> = [
    { value: 'none', label: isRussian ? 'Без уведомления' : 'No notification' },
    { value: 'send-error', label: isRussian ? 'Ошибка отправки' : 'Send failure' },
    { value: 'draft-error', label: isRussian ? 'Ошибка черновика' : 'Draft storage failure' },
    { value: 'attachment-error', label: isRussian ? 'Ошибка вложения' : 'Attachment failure' },
    { value: 'text-error', label: isRussian ? 'Ошибка импорта' : 'Text import failure' },
    { value: 'chat-error', label: isRussian ? 'Чат не найден' : 'Chat not found' },
    { value: 'history-error', label: isRussian ? 'Ошибка истории' : 'History failure' },
    { value: 'preview-error', label: isRussian ? 'История чата недоступна' : 'Chat history unavailable' },
    { value: 'connection-error', label: isRussian ? 'Нет связи с Telegram' : 'Telegram connection failure' },
    { value: 'provider-error', label: isRussian ? 'Ограничение Telegram' : 'Telegram rate limit' },
    { value: 'warning', label: isRussian ? 'Предупреждение расписания' : 'Schedule warning' },
    { value: 'mass-warning', label: isRussian ? 'Массовое планирование' : 'Mass scheduling warning' },
    { value: 'progress', label: isRussian ? 'Отправка' : 'Sending' },
    { value: 'success', label: isRussian ? 'Успешная отправка' : 'Send success' },
  ];
  const errorMessage = {
    'send-error': t('studio.sendFailed'),
    'draft-error': t('studio.draftsCouldNotSave'),
    'attachment-error': t('studio.fixAttachment'),
    'text-error': t('studio.textFileReadFailed'),
    'chat-error': t('studio.addChatFailed'),
    'history-error': t('studio.historyCouldNotSave'),
    'preview-error': t('studio.previewHistoryFailed'),
    'connection-error': t('studio.connectionFailed'),
    'provider-error': isRussian
      ? 'Telegram: FLOOD_WAIT_60. Повторите через 60 секунд.'
      : 'Telegram: FLOOD_WAIT_60. Retry in 60 seconds.',
    warning: t('studio.futureDateTime'),
    'mass-warning': t('schedule.massWarningMessage', { count: 12 }),
    progress: '',
    success: t('studio.messageSent'),
    none: '',
  }[errorVariant];
  const confirmationOptions: Array<{ value: ConfirmationVariant; label: string }> = [
    { value: 'none', label: isRussian ? 'Без подтверждения' : 'No confirmation' },
    { value: 'delete-draft', label: isRussian ? 'Удаление черновика' : 'Delete draft' },
    { value: 'discard-changes', label: isRussian ? 'Несохранённые изменения' : 'Unsaved changes' },
  ];
  const scheduler = useMemo(() => {
    const actions: StudioSchedulerActions = {
      upcoming: [],
      sent: [],
      scheduling: false,
      successPulse: false,
      lastAction: null,
      revealingId: null,
      cancelingIds: new Set(),
      sendingIds: new Set(),
      publishingDraft: errorVariant === 'progress',
      handleSchedule: async () => false,
      handleSendDraftNow: async () => false,
      handleSendNow: () => undefined,
      handleDeleteMessage: () => undefined,
      handleClearSent: () => undefined,
      handleCancelMessage: async () => false,
      handleCancelMessages: async () => false,
    };
    return createStudioSchedulerRuntime(
      actions,
      {
        message: errorMessage,
        title: errorVariant === 'mass-warning' ? t('schedule.massWarningTitle') : 'Studio',
        type: errorVariant === 'warning' || errorVariant === 'mass-warning'
          ? 'warning'
          : errorVariant === 'success'
            ? 'success'
            : 'error',
        visible: !['none', 'progress'].includes(errorVariant),
      },
      () => setErrorVariant('none'),
    );
  }, [errorMessage, errorVariant, t]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const changeTheme = (nextTheme: ColorTheme) => {
    setTheme(nextTheme);
    applyTestbenchColorTheme(nextTheme, { animate: true });
  };

  return (
    <div className="product-shell studio-shell studio-editor-stand">
      <TestbenchNavigation
        locale={locale}
        setLocale={setLocale}
        theme={theme}
        onThemeChange={changeTheme}
        scenarioLabel={isRussian ? 'Сценарий уведомления' : 'Status scenario'}
        scenario={errorVariant}
        scenarioOptions={errorOptions}
        onScenarioChange={(value) => setErrorVariant(value as ErrorVariant)}
        confirmationLabel={isRussian ? 'Сценарий подтверждения' : 'Confirmation scenario'}
        confirmationScenario={confirmationVariant}
        confirmationOptions={confirmationOptions}
        onConfirmationScenarioChange={(value) => setConfirmationVariant(value as ConfirmationVariant)}
        onReset={() => {
          setErrorVariant('none');
          setConfirmationVariant('none');
        }}
        resetLabel={isRussian ? 'Сбросить' : 'Reset'}
        currentPage="studio"
      />
      <StudioApp
        connected
        chats={[botFatherChat]}
        selectedChat={selectedChat}
        onSelectChat={setSelectedChat}
        scheduler={scheduler}
      />
      {confirmationVariant !== 'none' && (
        <ConfirmDialogSurface
          title={confirmationVariant === 'delete-draft'
            ? (isRussian ? 'Удалить черновик?' : 'Delete this draft?')
            : (isRussian ? 'Отменить изменения?' : 'Discard your changes?')}
          message={confirmationVariant === 'delete-draft'
            ? (isRussian ? 'Черновик будет удалён без возможности восстановления.' : 'This draft will be permanently deleted.')
            : (isRussian ? 'Все несохранённые изменения будут потеряны.' : 'All unsaved changes will be lost.')}
          confirmLabel={confirmationVariant === 'delete-draft'
            ? (isRussian ? 'Удалить' : 'Delete')
            : (isRussian ? 'Отменить изменения' : 'Discard changes')}
          cancelLabel={isRussian ? 'Остаться' : 'Keep editing'}
          destructive={confirmationVariant === 'delete-draft'}
          onCancel={() => setConfirmationVariant('none')}
          onConfirm={() => setConfirmationVariant('none')}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <ConfirmDialogProvider>
      <Demo />
    </ConfirmDialogProvider>
  </LocaleProvider>,
);