import { createElement, type ReactNode } from 'react';
import { act, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, ScheduledMessage } from '@/types';
import { LocaleProvider } from '@/lib/i18n';
import { DEFAULT_EDITOR_APPEARANCE, writeEditorAppearancePreferences } from '@shared/editorAppearance';
import { flushPlannerDraftWrite, readPlannerDraftAttachments, writePlannerDraft } from '../lib/plannerDraft';
import { QuickPlanner } from './QuickPlanner';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';

function render(ui: ReactNode) {
  return renderTestingLibrary(createElement(LocaleProvider, null, ui));
}

function createScheduledMessage(overrides: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'message-1',
    chatId: 'chat-1',
    chatName: 'Test chat',
    text: 'A scheduled message',
    when: '2035-05-12T15:00:00.000Z',
    createdAt: '2035-05-10T10:00:00.000Z',
    status: 'scheduled',
    ...overrides,
  };
}

describe('QuickPlanner feedback', () => {
  beforeEach(() => {
    flushPlannerDraftWrite();
    for (const key of [
      'xmsgi-planner-draft-text',
      'xmsgi-planner-draft-updated-at',
      'xmsgi-planner-draft-entities',
      'xmsgi-planner-draft-attachments',
      'xmsgi-planner-draft-snapshot-v1',
      'xmsgi:active-draft:v1',
    ]) localStorage.removeItem(key);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    flushPlannerDraftWrite();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'telegram');
    localStorage.removeItem('xmsgi-quick-planner-recent-emojis');
    localStorage.removeItem('awaitmsg_locale');
    for (const key of [
      'xmsgi-planner-draft-text',
      'xmsgi-planner-draft-updated-at',
      'xmsgi-planner-draft-entities',
      'xmsgi-planner-draft-attachments',
      'xmsgi-planner-draft-snapshot-v1',
      'xmsgi:active-draft:v1',
    ]) localStorage.removeItem(key);
  });

  it('does not populate the chat picker with sample chats', () => {
    render(<QuickPlanner />);

    expect(screen.getByRole('button', { name: 'Choose a chat' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a chat' }));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('No chats found')).toBeInTheDocument();
  });

  it('renders a feedback preview in the same accessible Planner status slot', () => {
    render(<QuickPlanner feedbackPreview={{ tone: 'error', message: 'Could not send the message.' }} />);

    const feedback = screen.getByRole('alert');
    expect(feedback).toHaveTextContent('Could not send the message.');
    expect(feedback).toHaveAttribute('title', 'Could not send the message.');
    expect(feedback).toHaveClass('quick-planner-action-feedback', 'is-error');
  });

  it('renders retry and dismiss actions in notification previews', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<QuickPlanner feedbackPreview={{
      tone: 'error',
      message: 'Could not send the message.',
      actions: [
        { id: 'retry', label: 'Retry', onClick: onRetry },
        { id: 'dismiss', label: 'Dismiss', onClick: onDismiss },
      ],
    }} />);

    const feedback = screen.getByRole('alert');
    expect(feedback).toHaveTextContent('Could not send the message.');
    expect(feedback).toHaveClass('has-actions');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('restores the Planner text and attachment chips after remounting', () => {
    writePlannerDraft('Survives reload', [], ['C:\\files\\report.pdf']);
    expect(flushPlannerDraftWrite()).toBe(true);

    const firstRender = render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    expect(editor).toHaveValue('Survives reload');
    expect(firstRender.container.querySelector('.quick-planner-attachment-name')).toHaveTextContent('report.pdf');

    fireEvent.change(editor, { target: { value: 'Updated before reload' } });
    expect(flushPlannerDraftWrite()).toBe(true);
    firstRender.unmount();

    const secondRender = render(<QuickPlanner />);
    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('Updated before reload');
    expect(secondRender.container.querySelector('.quick-planner-attachment-name')).toHaveTextContent('report.pdf');
  });

  it('translates the Planner page and its accessible controls into Russian', () => {
    localStorage.setItem('awaitmsg_locale', 'ru');

    render(<QuickPlanner />);

    expect(screen.getByRole('heading', { name: 'Новое сообщение' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Новое сообщение' })).toHaveAttribute('lang', 'ru');
    expect(document.querySelector('.quick-planner-schedule-label')).toHaveTextContent('ЗАПЛАНИРОВАТЬ');
    expect(screen.getByRole('textbox', { name: 'Текст напоминания' })).toHaveAttribute('placeholder', 'Запишите то, что важно…');
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Активность' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Предстоящие' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }));
    const datePicker = screen.getByRole('dialog', { name: 'Выбор даты отправки' });
    expect(datePicker).toHaveTextContent(new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date()));
    expect(datePicker.querySelector('.quick-planner-date-picker-weekdays')).toHaveTextContent('пн');

    fireEvent.click(screen.getByRole('button', { name: 'Открыть окно эмодзи' }));
    expect(screen.getByRole('dialog', { name: 'Выбрать эмодзи' })).toHaveTextContent('Лица');

    fireEvent.click(screen.getByRole('button', { name: 'Черновик' }));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('shows translated Activity and Upcoming empty states', () => {
    render(<QuickPlanner />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByText('No confirmed sends in the last 7 days.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming messages.')).toBeInTheDocument();
    expect(document.querySelector('.quick-planner-schedule-label')).toHaveTextContent('SCHEDULE');
  });

  it('charts only distinct confirmed sends with valid sentAt timestamps over local days', () => {
    const now = new Date(2035, 4, 12, 12, 0, 0);
    vi.setSystemTime(now);
    const sentAt = new Date(2035, 4, 12, 9, 30, 0).toISOString();
    const sent = [
      createScheduledMessage({ id: 'send-a', status: 'sent', sentAt, sendAttemptId: 'attempt-a' }),
      createScheduledMessage({ id: 'duplicate', status: 'sent', sentAt, sendAttemptId: 'attempt-a' }),
      createScheduledMessage({ id: 'send-b', status: 'sent', sentAt }),
      createScheduledMessage({ id: 'unknown', status: 'unknown', sentAt }),
      createScheduledMessage({ id: 'failed', status: 'failed', sentAt }),
      createScheduledMessage({ id: 'missing-time', status: 'sent', sentAt: undefined }),
      createScheduledMessage({ id: 'invalid-time', status: 'sent', sentAt: 'not-a-date' }),
      createScheduledMessage({ id: 'planned', status: 'scheduled', sentAt }),
    ];

    render(<QuickPlanner sent={sent} />);

    const dateLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now);
    expect(screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 2' })).toBeInTheDocument();
    expect(screen.getByTitle(`${dateLabel}: 2 messages sent`)).toBeInTheDocument();
    expect(screen.getByText('Confirmed sends: 2')).toBeInTheDocument();
  });

  it('includes a newly received confirmed send even when the scheduling clock state is stale', () => {
    const initialTime = new Date('2035-05-12T12:00:00.000Z');
    vi.setSystemTime(initialTime);
    const view = render(<QuickPlanner sent={[]} />);

    const sentAt = new Date(initialTime.getTime() + 500).toISOString();
    vi.setSystemTime(new Date(initialTime.getTime() + 1000));
    view.rerender(createElement(LocaleProvider, null, createElement(QuickPlanner, {
      sent: [createScheduledMessage({ status: 'sent', sentAt })],
    })));

    expect(screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 1' })).toBeInTheDocument();
    expect(screen.queryByText('No confirmed sends in the last 7 days.')).not.toBeInTheDocument();
  });

  it('does not present history load errors as an empty activity state', () => {
    render(<QuickPlanner historyReady={false} historyError />);

    expect(screen.getAllByText('Message history could not be loaded.')).toHaveLength(2);
    expect(screen.queryByText('No confirmed sends in the last 7 days.')).not.toBeInTheDocument();
    expect(screen.queryByText('No upcoming messages.')).not.toBeInTheDocument();
  });

  it('shows no chart when saved sent records have no valid sentAt value', () => {
    render(<QuickPlanner sent={[
      createScheduledMessage({ id: 'missing-time', status: 'sent' }),
      createScheduledMessage({ id: 'invalid-time', status: 'sent', sentAt: 'invalid' }),
    ]} />);

    expect(screen.getByText('No confirmed sends in the last 7 days.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows loading rather than empty states until history is restored', () => {
    render(<QuickPlanner historyReady={false} />);

    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
    expect(screen.getByText('Loading upcoming messages…')).toBeInTheDocument();
  });

  it('shows only future scheduled messages in chronological order and updates with props', () => {
    vi.setSystemTime(new Date('2035-05-12T12:00:00.000Z'));
    const first = createScheduledMessage({
      id: 'first',
      chatName: 'First chat',
      text: 'First upcoming',
      when: '2035-05-12T13:00:00.000Z',
    });
    const second = createScheduledMessage({
      id: 'second',
      chatName: 'Second chat',
      text: 'Second upcoming',
      when: '2035-05-12T14:00:00.000Z',
    });
    const cancelled = createScheduledMessage({ id: 'cancelled', text: 'Cancelled record' });
    Object.assign(cancelled, { status: 'cancelled' });
    const view = render(<QuickPlanner upcoming={[
      second,
      first,
      createScheduledMessage({ id: 'past', text: 'Expired record', when: '2035-05-12T11:00:00.000Z' }),
      createScheduledMessage({ id: 'sent', status: 'sent', text: 'Sent record' }),
      createScheduledMessage({ id: 'failed', status: 'failed', text: 'Failed record' }),
      createScheduledMessage({ id: 'sending', status: 'sending', text: 'Sending record' }),
      createScheduledMessage({ id: 'unknown', status: 'unknown', text: 'Unknown record' }),
      createScheduledMessage({ id: 'pending', status: 'pending', text: 'Pending record' }),
      createScheduledMessage({ id: 'invalid', when: 'invalid-date', text: 'Invalid record' }),
      cancelled,
    ]} />);

    const items = view.container.querySelectorAll('.quick-planner-upcoming-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('First upcoming');
    expect(items[1]).toHaveTextContent('Second upcoming');
    for (const excluded of ['Expired record', 'Sent record', 'Failed record', 'Sending record', 'Unknown record', 'Pending record', 'Invalid record', 'Cancelled record']) {
      expect(screen.queryByText(excluded)).not.toBeInTheDocument();
    }

    view.rerender(createElement(LocaleProvider, null, createElement(QuickPlanner, {
      upcoming: [createScheduledMessage({ id: 'updated', text: 'Updated schedule', when: '2035-05-12T16:00:00.000Z' })],
    })));
    expect(screen.getByText('Updated schedule')).toBeInTheDocument();
    expect(screen.queryByText('First upcoming')).not.toBeInTheDocument();
  });

  it('formats upcoming ISO timestamps as the local scheduled instant', () => {
    const when = '2035-05-12T15:00:00.000Z';
    render(<QuickPlanner upcoming={[createScheduledMessage({ when })]} />);

    const displayedTime = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(when));
    expect(screen.getByText(displayedTime)).toBeInTheDocument();
    expect(screen.getByText(displayedTime)).toHaveAttribute('title', new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(when)));
  });

  it('keeps full long Upcoming labels available while displaying compact previews', () => {
    const chatName = 'A very long channel name that needs more than one line';
    const messageText = 'A detailed message preview that should remain available in full';
    render(<QuickPlanner upcoming={[createScheduledMessage({
      chatName,
      text: messageText,
    })]} />);

    expect(screen.getByText(chatName)).toHaveAttribute('title', chatName);
    expect(screen.getByText(messageText)).toHaveAttribute('title', messageText);
  });

  it('uses a translated content label for a scheduled attachment with no text', () => {
    render(<QuickPlanner upcoming={[createScheduledMessage({
      text: '',
      attachments: ['C:\\files\\image.png'],
    })]} />);

    expect(screen.getByText('Media message')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('restarts repeated validation warnings and dismisses them after the Studio timeout', () => {
    render(<QuickPlanner />);
    const submitButton = screen.getByRole('button', { name: 'Schedule post' });

    fireEvent.click(submitButton);
    const firstStatus = screen.getByRole('status');
    expect(firstStatus).not.toHaveClass('is-retriggered');
    fireEvent.click(submitButton);
    const repeatedStatus = screen.getByRole('status');

    expect(repeatedStatus).not.toBe(firstStatus);
    expect(repeatedStatus).toHaveClass('is-retriggered');
    expect(repeatedStatus).toHaveClass('is-warning');
    expect(repeatedStatus).toHaveClass('planner-inline-notification');
    expect(repeatedStatus.querySelector('svg')).toBeNull();

    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(submitButton);
    const nextStatus = screen.getByRole('status');
    expect(nextStatus).not.toHaveClass('is-retriggered');
    fireEvent.click(submitButton);
    expect(screen.getByRole('status')).toHaveClass('is-retriggered');
  });

  it('uses the Studio warning and success notification durations', () => {
    const chat: Chat = { id: 'chat-1', name: 'Test channel', type: 'channel' };
    const { container } = render(<QuickPlanner
      chats={[chat]}
      selectedChat={chat}
      onSaveDraft={() => true}
      onSchedule={async () => true}
    />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const submitButton = () => container.querySelector<HTMLButtonElement>(
      '.quick-planner-schedule-row .quick-planner-submit',
    )!;

    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    fireEvent.click(submitButton());

    let status = screen.getByRole('status');
    expect(status).toHaveClass('is-warning');
    expect(status).toHaveClass('planner-inline-notification');
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.change(editor, {
      target: { value: 'Test status message' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(submitButton());
    status = screen.getByRole('status');
    expect(status).toHaveClass('is-success');
    act(() => vi.advanceTimersByTime(3359));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

  });

  it('shows fractional local timezone offsets without changing the timezone control width', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);

    const { container } = render(<QuickPlanner />);
    const timeZone = screen.getByText('GMT+5:45');

    expect(timeZone).toHaveClass('quick-planner-timezone');
    expect(container.querySelector('.quick-planner-timezone')?.textContent).toBe('GMT+5:45');
  });

  it('keeps the default blue accent when custom colors are written or action modes change', () => {
    const { container } = render(<QuickPlanner />);
    const planner = container.querySelector<HTMLElement>('.quick-planner')!;
    const modeGroup = screen.getByRole('group', { name: 'Planner actions' });

    expect(planner.style.getPropertyValue('--planner-accent')).toBe('#239dfb');

    act(() => {
      writeEditorAppearancePreferences({
        style: 'outline',
        palette: 'custom',
        modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
      });
    });
    expect(planner.style.getPropertyValue('--planner-accent')).toBe('#239dfb');

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Draft' }));
    expect(planner.style.getPropertyValue('--planner-accent')).toBe('#239dfb');

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Send now' }));
    expect(planner.style.getPropertyValue('--planner-accent')).toBe('#239dfb');

    act(() => writeEditorAppearancePreferences(DEFAULT_EDITOR_APPEARANCE));
    expect(planner.style.getPropertyValue('--planner-accent')).toBe('#239dfb');
  });

  it('removes group and channel chats from Planner through the existing remove callback', () => {
    const group: Chat = { id: 'group-1', name: 'Design group', type: 'group' };
    const channel: Chat = { id: 'channel-1', name: 'News channel', type: 'channel' };
    const onRemoveChat = vi.fn();
    const { container } = render(<QuickPlanner chats={[group, channel]} onRemoveChat={onRemoveChat} />);

    fireEvent.click(container.querySelector('.quick-planner-chat')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Design group from Planner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove News channel from Planner' }));

    expect(onRemoveChat).toHaveBeenNthCalledWith(1, group);
    expect(onRemoveChat).toHaveBeenNthCalledWith(2, channel);
  });

  it('clears reminder text with one click and returns focus to the editor', () => {
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'A long reminder to erase' } });

    const clearButton = screen.getByRole('button', { name: 'Clear reminder text' });
    expect(clearButton.parentElement).toHaveClass('quick-planner-counter-controls');
    expect(clearButton.previousElementSibling).toHaveClass('quick-planner-character-count');
    fireEvent.click(clearButton);

    expect(editor).toHaveValue('');
    expect(editor).toHaveFocus();
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveAttribute('aria-hidden', 'true');
    expect(clearButton).toHaveClass('is-hidden');
  });

  it('opens the emoji picker 5px beside the smile button', () => {
    const { container } = render(<QuickPlanner />);
    const toolAnchors = container.querySelectorAll<HTMLElement>(
      '.quick-planner-tools > .quick-planner-tool-anchor',
    );
    vi.spyOn(toolAnchors[0], 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 160, 48, 48));
    vi.spyOn(toolAnchors[2], 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 160, 48, 48));

    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));

    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toHaveStyle({ left: '253px' });
  });

  it('loads Telegram effect IDs and selects a real message effect', async () => {
    const getAvailableEffects = vi.fn().mockResolvedValue({
      success: true,
      effects: [
        { id: '123456789', emoticon: '🎉', premiumRequired: false },
        { id: '223456789', emoticon: '👍', premiumRequired: false },
        { id: '323456789', emoticon: '👎', premiumRequired: false },
        { id: '423456789', emoticon: '🔥', premiumRequired: false },
        { id: '987654321', emoticon: '✨', premiumRequired: true },
      ],
    });
    Object.defineProperty(window, 'telegram', { configurable: true, value: { getAvailableEffects } });
    const onOpenInStudio = vi.fn();
    const { container } = render(<QuickPlanner onOpenInStudio={onOpenInStudio} />);
    await act(async () => { await Promise.resolve(); });
    expect(getAvailableEffects).toHaveBeenCalledOnce();

    expect(Array.from(container.querySelectorAll('.quick-planner-tools > .quick-planner-tool-anchor > button'))
      .map((button) => button.getAttribute('aria-label')))
      .toEqual(['Attach files', 'Message effects', 'Open emoji window']);

    const attachmentButton = screen.getByRole('button', { name: 'Attach files' });
    const effectsButton = screen.getByRole('button', { name: 'Message effects' });
    const emojiButton = screen.getByRole('button', { name: 'Open emoji window' });
    for (const button of [attachmentButton, effectsButton, emojiButton]) {
      expect(button.querySelector('svg')).toHaveAttribute('width', '24');
      expect(button.querySelector('svg')).toHaveAttribute('height', '24');
    }
    fireEvent.click(effectsButton);
    const effectsGrid = screen.getByRole('group', { name: 'Choose message effect' });
    expect(effectsGrid).toBeInTheDocument();
    expect(within(effectsGrid).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['effect 🎉', 'effect 👍', 'effect 👎', 'No effect', 'effect 🔥']);
    expect(screen.queryByRole('button', { name: 'Premium effect ✨' })).not.toBeInTheDocument();
    const effectOption = screen.getByRole('button', { name: 'effect 🎉' });
    fireEvent.click(effectOption);
    expect(effectsButton).toHaveAttribute('aria-pressed', 'true');
    expect(effectsButton).toHaveAttribute('title', 'Message effects: 🎉');
    fireEvent.click(effectsButton);
    const noEffectButton = screen.getByRole('button', { name: 'No effect' });
    expect(noEffectButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(noEffectButton);
    expect(effectsButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows categorized emojis and inserts the chosen emoji at the cursor', () => {
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Good day' } });
    (editor as HTMLTextAreaElement).setSelectionRange(4, 4);

    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const emojiPicker = screen.getByRole('dialog', { name: 'Choose emoji' });
    expect(emojiPicker).toHaveClass('quick-planner-emoji-picker');
    expect(emojiPicker.parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('tab', { name: 'Hearts' }));
    expect(screen.getByRole('group', { name: 'Hearts emoji' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert ❤️' }));

    expect(editor).toHaveValue('Good❤️ day');
    expect(screen.queryByRole('dialog', { name: 'Choose emoji' })).not.toBeInTheDocument();
  });

  it('persists the six latest unique emojis below the categories', () => {
    const selections = [
      { category: 'Faces', emoji: '😀' },
      { category: 'Hands', emoji: '👍' },
      { category: 'Hearts', emoji: '❤️' },
      { category: 'Nature', emoji: '🔥' },
      { category: 'Food', emoji: '🍎' },
      { category: 'Fun', emoji: '🎉' },
    ];

    const firstMount = render(<QuickPlanner />);
    for (const selection of selections) {
      fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
      fireEvent.click(screen.getByRole('tab', { name: selection.category }));
      const categoryGrid = screen.getByRole('group', { name: `${selection.category} emoji` });
      const emojiButton = within(categoryGrid).getByRole('button', { name: `Insert ${selection.emoji}` });
      fireEvent.click(emojiButton);
    }
    firstMount.unmount();

    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const picker = screen.getByRole('dialog', { name: 'Choose emoji' });
    const recentGroup = within(picker).getByRole('group', { name: 'Recent emoji' });
    expect(within(recentGroup).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Insert recent 🎉', 'Insert recent 🍎', 'Insert recent 🔥', 'Insert recent ❤️', 'Insert recent 👍', 'Insert recent 😀']);
    expect(picker.querySelector('.quick-planner-emoji-categories')!.compareDocumentPosition(
      picker.querySelector('.quick-planner-emoji-recent')!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.querySelector('.quick-planner-emoji-search')!.compareDocumentPosition(
      picker.querySelector('.quick-planner-emoji-recent')!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the Recent order unchanged when selecting an emoji from Recent', async () => {
    localStorage.setItem('xmsgi-quick-planner-recent-emojis', JSON.stringify(['😀', '❤️', '😃']));
    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const getRecentOrder = () => within(screen.getByRole('group', { name: 'Recent emoji' }))
      .getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    const recentOrder = getRecentOrder();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert recent ❤️' }), { ctrlKey: true });
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
    expect(getRecentOrder()).toEqual(recentOrder);
    expect(JSON.parse(localStorage.getItem('xmsgi-quick-planner-recent-emojis')!)).toEqual(['😀', '❤️', '😃']);
  });

  it('closes the previous picker when opening the other toolbar picker', () => {
    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Message effects' }));
    expect(screen.queryByRole('dialog', { name: 'Choose emoji' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Message effects' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    expect(screen.queryByRole('dialog', { name: 'Message effects' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
  });

  it('opens the emoji window with the quick keyboard command', () => {
    render(<QuickPlanner />);

    fireEvent.keyDown(document, { key: '.', ctrlKey: true });

    const emojiButton = screen.getByRole('button', { name: 'Open emoji window' });
    expect(emojiButton).toHaveAttribute('title', 'Open emoji window (Ctrl+. / Cmd+.)');
    expect(emojiButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
  });

  it('opens emoji search from a colon command and replaces the query with the keyboard-selected result', () => {
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Say :heart', selectionStart: 10, selectionEnd: 10 } });

    expect(editor).toHaveValue('Say :heart');
    expect(screen.getByRole('searchbox', { name: 'Search emoji' })).toHaveValue('heart');
    expect(screen.getByRole('group', { name: 'Emoji search results' })).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(editor).toHaveValue('Say ❤️');
    expect(screen.queryByRole('dialog', { name: 'Choose emoji' })).not.toBeInTheDocument();
  });

  it('finds the same heart emoji from English and Russian picker searches', () => {
    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const search = screen.getByRole('searchbox', { name: 'Search emoji' });

    fireEvent.change(search, { target: { value: 'heart' } });
    const categories = screen.getByRole('tablist', { name: 'Emoji categories' });
    expect(within(categories).getByRole('tab', { name: 'Faces' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Emoji search results' }))
      .getByRole('button', { name: 'Insert ❤️' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'сердце' } });
    expect(within(categories).getByRole('tab', { name: 'Faces' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Emoji search results' }))
      .getByRole('button', { name: 'Insert ❤️' })).toBeInTheDocument();
  });

  it('searches emoji names in Russian and keeps the picker open when there are no matches', () => {
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Привет :сердце', selectionStart: 14, selectionEnd: 14 } });

    expect(screen.getByRole('searchbox', { name: 'Search emoji' })).toHaveValue('сердце');
    const results = screen.getByRole('group', { name: 'Emoji search results' });
    expect(within(results).getByRole('button', { name: 'Insert ❤️' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search emoji' }), { target: { value: 'no-such-emoji' } });

    const picker = screen.getByRole('dialog', { name: 'Choose emoji' });
    expect(within(picker).getByRole('status')).toHaveTextContent('No emojis found.');
    expect(within(picker).getByRole('searchbox', { name: 'Search emoji' })).toBeInTheDocument();
    expect(within(picker).getByRole('region', { name: 'Recent emojis' })).toBeInTheDocument();
  });

  it('keeps the picker open for Ctrl selections and closes on a normal selection', async () => {
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Hi ' } });
    (editor as HTMLTextAreaElement).setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const modifierHint = screen.getByText('Hold Ctrl to add more');
    expect(modifierHint).toBeInTheDocument();
    expect(modifierHint.closest('.quick-planner-emoji-recent-heading')).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert 😀' }), { ctrlKey: true });
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(editor).toHaveValue('Hi 😀');
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert 😃' }), { ctrlKey: true });
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(editor).toHaveValue('Hi 😀😃');
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert 😄' }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(editor).toHaveValue('Hi 😀😃😄');
    expect(screen.queryByRole('dialog', { name: 'Choose emoji' })).not.toBeInTheDocument();
  });

  it('closes the picker shortly after Ctrl is released following a multi-select', async () => {
    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    fireEvent.keyDown(document, { key: 'Control' });
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toHaveClass('is-modifier-held');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert 😀' }), { ctrlKey: true });
      await vi.advanceTimersByTimeAsync(20);
    });

    fireEvent.keyUp(document, { key: 'Control' });
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).not.toHaveClass('is-modifier-held');
    await act(async () => vi.advanceTimersByTimeAsync(699));
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByRole('dialog', { name: 'Choose emoji' })).not.toBeInTheDocument();
  });

  it('forwards send, schedule, and draft actions to Posts callbacks', async () => {
    const chat: Chat = { id: 'chat-1', name: 'Studio channel', type: 'channel' };
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: {
        getAvailableEffects: vi.fn().mockResolvedValue({
          success: true,
          effects: [
            { id: '111', emoticon: '🔥', premiumRequired: false },
            { id: '222', emoticon: '🎉', premiumRequired: false },
          ],
        }),
        getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`),
      },
    });
    const onSendNow = vi.fn().mockResolvedValue(true);
    const onSchedule = vi.fn().mockResolvedValue(true);
    const onSaveDraft = vi.fn().mockReturnValue(true);
    const openPosts = vi.fn();
    const { container } = render(
      <QuickPlannerNavigationContext.Provider value={{
        currentSection: 'quick-plan',
        openQuickPlan: vi.fn(),
        openStudio: vi.fn(),
        openPosts,
        openSettings: vi.fn(),
      }}>
        <QuickPlanner
          chats={[chat]}
          selectedChat={chat}
          onSendNow={onSendNow}
          onSchedule={onSchedule}
          onSaveDraft={onSaveDraft}
        />
      </QuickPlannerNavigationContext.Provider>,
    );
    await act(async () => { await Promise.resolve(); });
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const submit = () => container.querySelector<HTMLButtonElement>('.quick-planner-schedule-row .quick-planner-submit')!;
    const addPhoto = (name: string) => fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], name, { type: 'image/png' })] },
    });
    const selectEffect = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Message effects' }));
      fireEvent.click(screen.getByRole('button', { name }));
    };

    selectEffect('effect 🔥');
    fireEvent.change(editor, { target: { value: 'Send from Planner' } });
    addPhoto('send.png');
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSendNow).toHaveBeenCalledWith(chat, 'Send from Planner', ['C:/photos/send.png'], '111');
    expect(openPosts).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Message effects' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveClass('is-success');
    expect(screen.getByRole('status')).toHaveTextContent('Message sent.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Posts');

    fireEvent.change(editor, { target: { value: 'Schedule from Planner' } });
    addPhoto('schedule.png');
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    selectEffect('effect 🎉');
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSchedule).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveClass('is-warning');
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({
      chatId: chat.id,
      message: 'Schedule from Planner',
      date: expect.any(String),
      time: expect.any(String),
      attachments: ['C:/photos/schedule.png'],
      effect: '222',
    }));
    expect(openPosts).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Message effects' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveClass('is-success');
    expect(screen.getByRole('status')).toHaveTextContent('Schedule request sent.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Posts');

    fireEvent.change(editor, { target: { value: 'Save from Planner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSaveDraft).toHaveBeenCalledWith({ message: 'Save from Planner', attachments: [] });
    expect(openPosts).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Posts');
  });

  it('keeps Planner text and photos when Telegram rejects sending or scheduling', async () => {
    const chat: Chat = { id: 'chat-1', name: 'Studio channel', type: 'channel' };
    const onSendNow = vi.fn().mockResolvedValue(false);
    const onSchedule = vi.fn().mockResolvedValue(false);
    const openPosts = vi.fn();
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`) },
    });
    const { container } = render(
      <QuickPlannerNavigationContext.Provider value={{
        currentSection: 'quick-plan',
        openQuickPlan: vi.fn(),
        openStudio: vi.fn(),
        openPosts,
        openSettings: vi.fn(),
      }}>
        <QuickPlanner chats={[chat]} selectedChat={chat} onSendNow={onSendNow} onSchedule={onSchedule} />
      </QuickPlannerNavigationContext.Provider>,
    );
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const addPhoto = (name: string) => fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], name, { type: 'image/png' })] },
    });
    const submit = () => container.querySelector<HTMLButtonElement>('.quick-planner-schedule-row .quick-planner-submit')!;

    fireEvent.change(editor, { target: { value: 'Keep this send' } });
    addPhoto('failed-send.png');
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await act(async () => { fireEvent.click(submit()); await Promise.resolve(); });
    expect(onSendNow).toHaveBeenCalledWith(chat, 'Keep this send', ['C:/photos/failed-send.png'], undefined);
    expect(editor).toHaveValue('Keep this send');
    expect(screen.getByText('failed-send.png')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Message was not sent.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Posts');

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await act(async () => { fireEvent.click(submit()); await Promise.resolve(); });
    expect(onSchedule).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(submit()); await Promise.resolve(); });
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Keep this send',
      attachments: ['C:/photos/failed-send.png'],
    }));
    expect(editor).toHaveValue('Keep this send');
    expect(screen.getByText('failed-send.png')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Message could not be scheduled.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Posts');
    expect(openPosts).not.toHaveBeenCalled();
  });

  it('keeps Planner content and warns when Telegram sent but history persistence failed', async () => {
    const chat: Chat = { id: 'chat-history-failure', name: 'History failure chat' };
    const onSendNow = vi.fn().mockResolvedValue('sent-history-failed');
    const { container } = render(
      <QuickPlanner chats={[chat]} selectedChat={chat} onSendNow={onSendNow} />,
    );
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const submit = () => container.querySelector<HTMLButtonElement>('.quick-planner-schedule-row .quick-planner-submit')!;

    fireEvent.change(editor, { target: { value: 'Keep confirmed message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await act(async () => { fireEvent.click(submit()); await Promise.resolve(); });

    expect(onSendNow).toHaveBeenCalledWith(chat, 'Keep confirmed message', undefined, undefined);
    expect(editor).toHaveValue('Keep confirmed message');
    expect(screen.getByRole('status')).toHaveClass('is-warning');
    expect(screen.getByRole('status')).toHaveTextContent('Message history could not be saved.');
    expect(screen.getByRole('status')).not.toHaveClass('is-success');
  });

  it('uses the first chat-name letter in placeholder avatars', () => {
    const chat: Chat = { id: 'chat-1', name: 'Design group', type: 'group' };
    const { container } = render(<QuickPlanner chats={[chat]} selectedChat={chat} />);

    expect(container.querySelector('.quick-planner-chat > .quick-planner-chat-avatar')).toHaveTextContent('D');
    fireEvent.click(container.querySelector('.quick-planner-chat')!);
    const chatOption = screen.getByRole('option', { name: /Design group/ });
    expect(chatOption.querySelector('.quick-planner-chat-avatar')).toHaveTextContent('D');
  });

  it('warns instead of opening Studio when draft text is empty', () => {
    const openStudio = vi.fn();
    render(
      <QuickPlannerNavigationContext.Provider value={{
        currentSection: 'quick-plan',
        openQuickPlan: vi.fn(),
        openStudio,
        openPosts: vi.fn(),
        openSettings: vi.fn(),
      }}>
        <QuickPlanner />
      </QuickPlannerNavigationContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(screen.getByRole('status')).toHaveTextContent('Write a message before opening Studio.');
    expect(openStudio).not.toHaveBeenCalled();
  });

  it('opens Studio when draft text is present', () => {
    const openStudio = vi.fn();
    const onOpenInStudio = vi.fn();
    render(
      <QuickPlannerNavigationContext.Provider value={{
        currentSection: 'quick-plan',
        openQuickPlan: vi.fn(),
        openStudio,
        openPosts: vi.fn(),
        openSettings: vi.fn(),
      }}>
        <QuickPlanner onOpenInStudio={onOpenInStudio} />
      </QuickPlannerNavigationContext.Provider>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Write the next idea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'Write the next idea',
      attachments: [],
      entities: [],
    });
    expect(openStudio).not.toHaveBeenCalled();
  });

  it('passes selected attachment paths when opening Studio from Planner', () => {
    const previousTelegram = Object.getOwnPropertyDescriptor(window, 'telegram');
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`) },
    });
    const onOpenInStudio = vi.fn();
    const { container } = render(<QuickPlanner onOpenInStudio={onOpenInStudio} />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Photo caption' } });
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'Photo caption',
      attachments: ['C:/photos/photo.png'],
      entities: [],
    });

    if (previousTelegram) Object.defineProperty(window, 'telegram', previousTelegram);
    else Reflect.deleteProperty(window, 'telegram');
  });

  it('opens Studio with a photo even when the Planner caption is empty', () => {
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`) },
    });
    const onOpenInStudio = vi.fn();
    const { container } = render(<QuickPlanner onOpenInStudio={onOpenInStudio} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: '',
      attachments: ['C:/photos/photo.png'],
      entities: [],
    });
  });

  it('keeps selected photos separate in Planner until the user explicitly opens Studio', () => {
    const getFilePath = vi.fn((file: File) => `C:/photos/${file.name}`);
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath },
    });
    const onOpenInStudio = vi.fn();
    const { container } = render(<QuickPlanner onOpenInStudio={onOpenInStudio} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
    });

    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('File added.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Studio');
    expect(onOpenInStudio).not.toHaveBeenCalled();
    const emojiTool = screen.getByRole('button', { name: 'Open emoji window' }).closest('.quick-planner-tool-anchor');
    const attachmentPanel = emojiTool?.nextElementSibling;
    expect(attachmentPanel).toHaveClass('quick-planner-attachments');
    expect(attachmentPanel?.querySelector('.quick-planner-attachments-scrollbar')).toBeInTheDocument();
    expect(attachmentPanel?.querySelector('.quick-planner-attachment-list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove photo.png' })).toBeInTheDocument();
    expect(readPlannerDraftAttachments()).toEqual(['C:/photos/photo.png']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo.png' }));
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
    expect(readPlannerDraftAttachments()).toEqual([]);
    expect(onOpenInStudio).not.toHaveBeenCalled();
  });

  it('accepts file drops on the text field and highlights it while dragging', () => {
    const getFilePath = vi.fn((file: File) => `C:/photos/${file.name}`);
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath },
    });
    render(<QuickPlanner />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const file = new File(['photo'], 'dropped.png', { type: 'image/png' });
    const dataTransfer = {
      files: [file],
      types: ['Files'],
      dropEffect: 'none',
    };

    fireEvent.dragEnter(editor, { dataTransfer });
    expect(editor).toHaveClass('is-file-drag-over');
    fireEvent.dragOver(editor, { dataTransfer });
    fireEvent.drop(editor, { dataTransfer });

    expect(editor).not.toHaveClass('is-file-drag-over');
    expect(editor).toHaveValue('');
    expect(screen.getByText('dropped.png')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('File added.');
    expect(getFilePath).toHaveBeenCalledWith(file);
    expect(readPlannerDraftAttachments()).toEqual(['C:/photos/dropped.png']);
  });

  it('limits Planner attachments to ten and reports the limit', () => {
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`) },
    });
    const { container } = render(<QuickPlanner />);
    const files = Array.from({ length: 12 }, (_, index) => (
      new File([`photo-${index}`], `photo-${index}.png`, { type: 'image/png' })
    ));
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files },
    });

    expect(container.querySelectorAll('.quick-planner-attachment')).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent('Max 10 files per message.');
    expect(screen.getByRole('status')).toHaveClass('is-warning');
  });

  it('keeps attachment chips in a single scrollable row without an extra scrollbar pad', () => {
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: { getFilePath: vi.fn((file: File) => `C:/photos/${file.name}`) },
    });
    const { container } = render(<QuickPlanner />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [
        new File(['one'], 'one.png', { type: 'image/png' }),
        new File(['two'], 'two.png', { type: 'image/png' }),
      ] },
    });
    const panel = container.querySelector('.quick-planner-attachments')!;
    const list = panel.querySelector('.quick-planner-attachment-list') as HTMLDivElement;

    const scrollbar = panel.querySelector('.quick-planner-attachments-scrollbar') as HTMLDivElement;
    expect(scrollbar).toBeInTheDocument();
    expect(list).toBeInTheDocument();

    Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(list, 'clientWidth', { configurable: true, value: 250 });
    Object.defineProperty(list, 'scrollLeft', { value: 0, writable: true, configurable: true });

    fireEvent.keyDown(list, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(list.scrollLeft).toBeGreaterThan(0);
    expect(scrollbar).toHaveAttribute('role', 'scrollbar');
  });

  it('passes the selected Telegram effect when opening Studio from Planner', async () => {
    Object.defineProperty(window, 'telegram', {
      configurable: true,
      value: {
        getAvailableEffects: vi.fn().mockResolvedValue({
          success: true,
          effects: [{ id: '123456789', emoticon: '🎉', premiumRequired: false }],
        }),
      },
    });
    const onOpenInStudio = vi.fn();
    render(<QuickPlanner onOpenInStudio={onOpenInStudio} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Effect caption' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Message effects' }));
    const effects = screen.getByRole('group', { name: 'Choose message effect' });
    fireEvent.click(within(effects).getByRole('button', { name: 'effect 🎉' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'Effect caption',
      attachments: [],
      entities: [],
      effect: '123456789',
    });
  });

  it('starts one minute ahead and clamps manually entered past times', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 10, 0));
    render(<QuickPlanner />);
    const timeTrigger = screen.getByRole('button', { name: 'Choose time' });

    expect(timeTrigger).toHaveTextContent('10:11');
    fireEvent.click(timeTrigger);
    fireEvent.change(screen.getByRole('textbox', { name: 'Enter schedule time' }), {
      target: { value: '09:00' },
    });

    expect(timeTrigger).toHaveTextContent('10:11');
  });

  it('keeps the selected schedule time fixed when the clock advances', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 14, 0));
    render(<QuickPlanner />);
    const timeTrigger = screen.getByRole('button', { name: 'Choose time' });

    expect(timeTrigger).toHaveTextContent('10:15');
    act(() => vi.advanceTimersByTime(60_025));

    expect(timeTrigger).toHaveTextContent('10:15');
  });

  it('warns once when schedule time has not been touched, then allows the second submit', async () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 10, 0));
    const chat: Chat = { id: 'chat-1', name: 'Studio channel', type: 'channel' };
    const onSchedule = vi.fn().mockResolvedValue(true);
    const { container } = render(<QuickPlanner chats={[chat]} selectedChat={chat} onSchedule={onSchedule} />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const submit = container.querySelector<HTMLButtonElement>('.quick-planner-schedule-row .quick-planner-submit')!;

    fireEvent.change(editor, { target: { value: 'Schedule without selecting a time' } });

    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
    });

    expect(onSchedule).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveClass('is-warning');
    expect(screen.getByRole('status')).toHaveTextContent('Schedule now? Press again to confirm.');

    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
    });

    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('keeps the date and time fields aligned in Send now without opening pickers', () => {
    render(<QuickPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    const dateTrigger = screen.getByRole('button', { name: 'Choose date' });
    const timeTrigger = screen.getByRole('button', { name: 'Choose time' });

    expect(dateTrigger).toHaveClass('is-readonly');
    expect(timeTrigger).toHaveClass('is-readonly');
    expect(dateTrigger).toHaveAttribute('aria-disabled', 'true');
    expect(timeTrigger).toHaveAttribute('aria-disabled', 'true');
    expect(dateTrigger.querySelector('svg:last-child')).toHaveStyle({ visibility: 'hidden' });
    expect(timeTrigger.querySelector('svg:last-child')).toHaveStyle({ visibility: 'hidden' });

    fireEvent.click(dateTrigger);
    fireEvent.click(timeTrigger);
    expect(screen.queryByRole('dialog', { name: 'Choose schedule date' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choose schedule time' })).not.toBeInTheDocument();
  });

  it('does not warn when NOW is selected before scheduling', async () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 10, 0));
    const chat: Chat = { id: 'chat-1', name: 'Studio channel', type: 'channel' };
    const onSchedule = vi.fn().mockResolvedValue(true);
    render(<QuickPlanner chats={[chat]} onSchedule={onSchedule} />);

    fireEvent.click(screen.getByRole('button', { name: 'NOW' }));

    expect(screen.getByRole('button', { name: 'Choose time' })).toHaveTextContent('10:11');
    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Schedule one minute from now' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule post' }));

    expect(onSchedule).toHaveBeenCalledWith({
      chatId: 'chat-1',
      message: 'Schedule one minute from now',
      date: '2026-10-19',
      time: '10:11',
    });
  });

  it('opens the calendar and 15-minute time list above the schedule controls', () => {
    render(<QuickPlanner />);
    const dateButton = screen.getByRole('button', { name: 'Choose date' });
    const originalDate = dateButton.textContent;

    fireEvent.click(dateButton);
    const calendar = screen.getByRole('dialog', { name: 'Schedule date picker' });
    expect(calendar).toBeInTheDocument();
    fireEvent.click(within(calendar).getByRole('button', { name: 'Next month' }));

    const nextMonthDay = calendar.querySelector<HTMLButtonElement>('[aria-pressed="false"]:not(:disabled)');
    expect(nextMonthDay).not.toBeNull();
    fireEvent.click(nextMonthDay!);
    expect(screen.queryByRole('dialog', { name: 'Schedule date picker' })).not.toBeInTheDocument();
    expect(dateButton.textContent).not.toBe(originalDate);
    expect(dateButton.querySelector('span')).toHaveTextContent(/^[A-Z][a-z]{2} \d{1,2}( '\d{2})?$/);

    fireEvent.click(screen.getByRole('button', { name: 'Choose time' }));
    const timePicker = screen.getByRole('dialog', { name: 'Schedule time picker' });
    const editableTime = within(timePicker).getByRole('textbox', { name: 'Enter schedule time' }) as HTMLInputElement;
    expect(editableTime).toHaveFocus();
    expect(editableTime.selectionStart).toBe(editableTime.selectionEnd);
    const timeList = within(timePicker).getByRole('listbox', { name: 'Available times' });
    expect(within(timeList).getAllByRole('option')).toHaveLength(96);

    fireEvent.click(within(timeList).getByRole('option', { name: '09:15' }));
    expect(screen.queryByRole('dialog', { name: 'Schedule time picker' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose time' })).toHaveTextContent('09:15');
  });
});