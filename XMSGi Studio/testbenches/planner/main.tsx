import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Chat } from '@/types';
import { LocaleProvider, useLocale } from '@/lib/i18n';
import type { ColorTheme } from '@/lib/colorTheme';
import { QuickPlanner } from '@/components/QuickPlanner';
import type { QuickPlannerActionFeedback } from '@/components/QuickPlanner';
import { QuickPlannerNavigationContext } from '@/workspace/QuickPlannerNavigationContext';
import { flushPlannerDraftWrite, writePlannerDraft } from '@/lib/plannerDraft';
import { TestbenchNavigation } from '../shared/TestbenchNavigation';
import { applyTestbenchColorTheme, readTestbenchColorTheme } from '../shared/testbenchTheme';
import './main.css';
import '../../src/index.css';
import '../../src/styles/colorThemes.css';

applyTestbenchColorTheme(readTestbenchColorTheme());

const demoChats: Chat[] = [
  { id: 'planner-demo-channel', name: 'XMSGi Updates', username: 'xmsgi_updates', type: 'channel' },
  { id: 'planner-demo-group', name: 'Studio team', type: 'group' },
  { id: 'planner-demo-private', name: 'Saved Messages', type: 'private' },
];

type Scenario = 'demo-chats' | 'no-chats';
type FeedbackScenario =
  | 'none'
  | 'empty-message'
  | 'schedule-confirmation'
  | 'schedule-too-soon'
  | 'chat-required'
  | 'empty-studio'
  | 'attachment-limit'
  | 'attachment-error'
  | 'send-error'
  | 'schedule-error'
  | 'draft-error';

function PlannerTestbench() {
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<ColorTheme>(readTestbenchColorTheme);
  const [scenario, setScenario] = useState<Scenario>('demo-chats');
  const [feedbackScenario, setFeedbackScenario] = useState<FeedbackScenario>('none');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(demoChats[0]);
  const [plannerRevision, setPlannerRevision] = useState(0);
  const isRussian = locale === 'ru';
  const chats = scenario === 'demo-chats' ? demoChats : [];
  const feedbackOptions: Array<{ value: FeedbackScenario; label: string }> = [
    { value: 'none', label: isRussian ? 'Без ошибки' : 'No feedback' },
    { value: 'empty-message', label: isRussian ? 'Пустое сообщение' : 'Empty message' },
    { value: 'schedule-confirmation', label: isRussian ? 'Не выбрано время' : 'Schedule time required' },
    { value: 'schedule-too-soon', label: isRussian ? 'Слишком раннее время' : 'Time too soon' },
    { value: 'chat-required', label: isRussian ? 'Не выбран чат' : 'Chat required' },
    { value: 'empty-studio', label: isRussian ? 'Пустой переход в Studio' : 'Open Studio with empty text' },
    { value: 'attachment-limit', label: isRussian ? 'Лимит вложений' : 'Attachment limit' },
    { value: 'attachment-error', label: isRussian ? 'Ошибка вложения' : 'Attachment unavailable' },
    { value: 'send-error', label: isRussian ? 'Ошибка отправки' : 'Send failure' },
    { value: 'schedule-error', label: isRussian ? 'Ошибка планирования' : 'Schedule failure' },
    { value: 'draft-error', label: isRussian ? 'Ошибка черновика' : 'Draft failure' },
  ];
  const feedbackPreviewByScenario: Partial<Record<FeedbackScenario, QuickPlannerActionFeedback>> = {
    'empty-message': { tone: 'warning', message: isRussian ? 'Введите текст сообщения.' : 'Write a message.' },
    'schedule-confirmation': { tone: 'warning', message: isRussian ? 'Выберите время отправки.' : 'Choose a send time.' },
    'schedule-too-soon': { tone: 'warning', message: isRussian ? 'Выберите время минимум через минуту.' : 'Choose a time at least one minute ahead.' },
    'chat-required': { tone: 'warning', message: isRussian ? 'Выберите подключённый чат.' : 'Choose a connected chat.' },
    'empty-studio': { tone: 'warning', message: isRussian ? 'Сначала введите сообщение.' : 'Write a message first.' },
    'attachment-limit': { tone: 'warning', message: isRussian ? 'Можно прикрепить до 10 файлов.' : 'Attach up to 10 files.' },
    'attachment-error': { tone: 'warning', message: isRussian ? 'Не удалось прикрепить файл.' : 'Could not attach the file.' },
    'send-error': { tone: 'error', message: isRussian ? 'Не удалось отправить сообщение.' : 'Could not send the message.' },
    'schedule-error': { tone: 'error', message: isRussian ? 'Не удалось запланировать отправку.' : 'Could not schedule the message.' },
    'draft-error': { tone: 'error', message: isRussian ? 'Не удалось сохранить черновик.' : 'Could not save the draft.' },
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const changeTheme = (nextTheme: ColorTheme) => {
    setTheme(nextTheme);
    applyTestbenchColorTheme(nextTheme, { animate: true });
  };

  const reset = () => {
    writePlannerDraft('');
    flushPlannerDraftWrite();
    setScenario('demo-chats');
    setFeedbackScenario('none');
    setSelectedChat(demoChats[0]);
    setPlannerRevision((revision) => revision + 1);
  };

  return (
    <div className="planner-testbench">
      <TestbenchNavigation
        locale={locale}
        setLocale={setLocale}
        theme={theme}
        onThemeChange={changeTheme}
        scenarioLabel={isRussian ? 'Список чатов' : 'Chat scenario'}
        scenario={scenario}
        scenarioOptions={[
          { value: 'demo-chats', label: isRussian ? 'Демо-чаты' : 'Demo chats' },
          { value: 'no-chats', label: isRussian ? 'Без чатов' : 'No chats' },
        ]}
        onScenarioChange={(value) => {
          const nextScenario = value as Scenario;
          setScenario(nextScenario);
          setSelectedChat(nextScenario === 'demo-chats' ? demoChats[0] : null);
        }}
        confirmationLabel={isRussian ? 'Сценарий ошибки' : 'Feedback scenario'}
        confirmationScenario={feedbackScenario}
        confirmationOptions={feedbackOptions}
        onConfirmationScenarioChange={(value) => setFeedbackScenario(value as FeedbackScenario)}
        onReset={reset}
        resetLabel={isRussian ? 'Сбросить' : 'Reset'}
        currentPage="planner"
      />
      <div className="planner-testbench-notice" role="note">
        {isRussian
          ? 'Демо-режим: отправка и планирование сообщений отключены.'
          : 'Demo mode: sending and scheduling messages are disabled.'}
      </div>
      <div className="product-shell planner-shell">
        <QuickPlannerNavigationContext.Provider value={{
          currentSection: 'quick-plan',
          openQuickPlan: () => undefined,
          openStudio: () => { window.location.href = '../studio-editor/'; },
          openPosts: () => undefined,
          openSettings: () => undefined,
        }}>
          <QuickPlanner
            key={plannerRevision}
            chats={chats}
            selectedChat={selectedChat}
            onSelectChat={setSelectedChat}
            onSendNow={async () => false}
            onSchedule={async () => false}
            onSaveDraft={() => false}
            feedbackPreview={feedbackPreviewByScenario[feedbackScenario] ?? null}
          />
        </QuickPlannerNavigationContext.Provider>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <PlannerTestbench />
  </LocaleProvider>,
);
