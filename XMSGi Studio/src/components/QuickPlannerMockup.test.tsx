import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@/types';
import { DEFAULT_EDITOR_APPEARANCE, writeEditorAppearancePreferences } from '@shared/editorAppearance';
import { QuickPlannerMockup } from './QuickPlannerMockup';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';

describe('QuickPlannerMockup feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'telegram');
    localStorage.removeItem('xmsgi-quick-planner-recent-emojis');
  });

  it('restarts repeated validation warnings and dismisses them after the Studio timeout', () => {
    render(<QuickPlannerMockup />);
    const submitButton = screen.getByRole('button', { name: 'Schedule post' });

    fireEvent.click(submitButton);
    const firstStatus = screen.getByRole('status');
    fireEvent.click(submitButton);
    const repeatedStatus = screen.getByRole('status');

    expect(repeatedStatus).not.toBe(firstStatus);
    expect(repeatedStatus).toHaveClass('is-warning');
    expect(repeatedStatus).toHaveClass('planner-inline-notification');
    expect(repeatedStatus.querySelector('svg')).toBeNull();

    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses the Studio warning, success, and notice durations', () => {
    const { container } = render(<QuickPlannerMockup />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Test status message' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    const submitButton = container.querySelector<HTMLButtonElement>(
      '.quick-planner-mockup-schedule-row .quick-planner-mockup-submit',
    );
    expect(submitButton).not.toBeNull();
    fireEvent.click(submitButton!);

    let status = screen.getByRole('status');
    expect(status).toHaveClass('is-warning');
    expect(status).toHaveClass('planner-inline-notification');
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(container.querySelector<HTMLButtonElement>(
      '.quick-planner-mockup-schedule-row .quick-planner-mockup-submit',
    )!);
    status = screen.getByRole('status');
    expect(status).toHaveClass('is-success');
    act(() => vi.advanceTimersByTime(3359));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(container.querySelector<HTMLButtonElement>(
      '.quick-planner-mockup-schedule-row .quick-planner-mockup-submit',
    )!);
    status = screen.getByRole('status');
    expect(status).toHaveClass('is-info');
  });

  it('shows fractional local timezone offsets without changing the timezone control width', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-345);

    const { container } = render(<QuickPlannerMockup />);
    const timeZone = screen.getByText('GMT+5:45');

    expect(timeZone).toHaveClass('quick-planner-mockup-timezone');
    expect(container.querySelector('.quick-planner-mockup-timezone')?.textContent).toBe('GMT+5:45');
  });

  it('uses the default and custom theme accents for each action mode and refreshes live', () => {
    const { container } = render(<QuickPlannerMockup />);
    const planner = container.querySelector<HTMLElement>('.quick-planner-mockup')!;
    const modeGroup = screen.getByRole('group', { name: 'Preview action modes' });

    expect(planner.style.getPropertyValue('--mockup-accent')).toBe('#239dfb');

    act(() => {
      writeEditorAppearancePreferences({
        style: 'outline',
        palette: 'custom',
        modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
      });
    });
    expect(planner.style.getPropertyValue('--mockup-accent')).toBe('#b482f5');

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Draft' }));
    expect(planner.style.getPropertyValue('--mockup-accent')).toBe('#f58b37');

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Send now' }));
    expect(planner.style.getPropertyValue('--mockup-accent')).toBe('#287fa6');

    act(() => writeEditorAppearancePreferences(DEFAULT_EDITOR_APPEARANCE));
    expect(planner.style.getPropertyValue('--mockup-accent')).toBe('#239dfb');
  });

  it('removes group and channel chats from Planner through the existing remove callback', () => {
    const group: Chat = { id: 'group-1', name: 'Design group', type: 'group' };
    const channel: Chat = { id: 'channel-1', name: 'News channel', type: 'channel' };
    const onRemoveChat = vi.fn();
    const { container } = render(<QuickPlannerMockup chats={[group, channel]} onRemoveChat={onRemoveChat} />);

    fireEvent.click(container.querySelector('.quick-planner-mockup-chat')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Design group from Planner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove News channel from Planner' }));

    expect(onRemoveChat).toHaveBeenNthCalledWith(1, group);
    expect(onRemoveChat).toHaveBeenNthCalledWith(2, channel);
  });

  it('clears reminder text with one click and returns focus to the editor', () => {
    render(<QuickPlannerMockup />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'A long reminder to erase' } });

    const clearButton = screen.getByRole('button', { name: 'Clear reminder text' });
    expect(clearButton.parentElement).toHaveClass('quick-planner-mockup-counter-controls');
    expect(clearButton.previousElementSibling).toHaveClass('quick-planner-mockup-character-count');
    fireEvent.click(clearButton);

    expect(editor).toHaveValue('');
    expect(editor).toHaveFocus();
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveAttribute('aria-hidden', 'true');
    expect(clearButton).toHaveClass('is-hidden');
  });

  it('shows a local effects mockup without connecting it to Telegram', () => {
    const onOpenInStudio = vi.fn();
    const { container } = render(<QuickPlannerMockup onOpenInStudio={onOpenInStudio} />);

    expect(Array.from(container.querySelectorAll('.quick-planner-mockup-tools > .quick-planner-mockup-tool-anchor > button'))
      .map((button) => button.getAttribute('aria-label')))
      .toEqual(['Attach files', 'Message effects', 'Open emoji window']);

    const effectsButton = screen.getByRole('button', { name: 'Message effects' });
    fireEvent.click(effectsButton);
    const effectsGrid = screen.getByRole('group', { name: 'Choose message effect' });
    expect(effectsGrid).toBeInTheDocument();
    expect(within(effectsGrid).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Hearts', 'Sparkles', 'Confetti', 'No effect', 'Thumbs up', 'Fire']);
    const effectOption = screen.getByRole('button', { name: 'Confetti' });
    fireEvent.click(effectOption);
    expect(effectsButton).toHaveAttribute('aria-pressed', 'true');
    expect(effectsButton).toHaveAttribute('title', 'Message effects: Confetti');
    fireEvent.click(effectsButton);
    const noEffectButton = screen.getByRole('button', { name: 'No effect' });
    expect(noEffectButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(noEffectButton);
    expect(effectsButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(effectsButton);
    fireEvent.click(screen.getByRole('button', { name: 'Confetti' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Effect test message' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: /Open in Studio/ }));
    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'Effect test message',
      attachments: [],
      entities: [],
    });
    expect(window.telegram?.getAvailableEffects).toBeUndefined();
  });

  it('shows categorized emojis and inserts the chosen emoji at the cursor', () => {
    render(<QuickPlannerMockup />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Good day' } });
    (editor as HTMLTextAreaElement).setSelectionRange(4, 4);

    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const emojiPicker = screen.getByRole('dialog', { name: 'Choose emoji' });
    expect(emojiPicker).toHaveClass('quick-planner-mockup-emoji-picker');
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

    const firstMount = render(<QuickPlannerMockup />);
    for (const selection of selections) {
      fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
      fireEvent.click(screen.getByRole('tab', { name: selection.category }));
      const categoryGrid = screen.getByRole('group', { name: `${selection.category} emoji` });
      const emojiButton = within(categoryGrid).getByRole('button', { name: `Insert ${selection.emoji}` });
      fireEvent.click(emojiButton);
    }
    firstMount.unmount();

    render(<QuickPlannerMockup />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const picker = screen.getByRole('dialog', { name: 'Choose emoji' });
    const recentGroup = within(picker).getByRole('group', { name: 'Recent emoji' });
    expect(within(recentGroup).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Insert recent 🎉', 'Insert recent 🍎', 'Insert recent 🔥', 'Insert recent ❤️', 'Insert recent 👍', 'Insert recent 😀']);
    expect(picker.querySelector('.quick-planner-mockup-emoji-categories')!.compareDocumentPosition(
      picker.querySelector('.quick-planner-mockup-emoji-recent')!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.querySelector('.quick-planner-mockup-emoji-recent')!.compareDocumentPosition(
      picker.querySelector('.quick-planner-mockup-emoji-search')!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the Recent order unchanged when selecting an emoji from Recent', async () => {
    localStorage.setItem('xmsgi-quick-planner-recent-emojis', JSON.stringify(['😀', '❤️', '😃']));
    render(<QuickPlannerMockup />);
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
    render(<QuickPlannerMockup />);
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
    render(<QuickPlannerMockup />);

    fireEvent.keyDown(document, { key: '.', ctrlKey: true });

    const emojiButton = screen.getByRole('button', { name: 'Open emoji window' });
    expect(emojiButton).toHaveAttribute('title', 'Open emoji window (Ctrl+. / Cmd+.)');
    expect(emojiButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Choose emoji' })).toBeInTheDocument();
  });

  it('opens emoji search from a colon command and replaces the query with the keyboard-selected result', () => {
    render(<QuickPlannerMockup />);
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
    render(<QuickPlannerMockup />);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const search = screen.getByRole('searchbox', { name: 'Search emoji' });

    fireEvent.change(search, { target: { value: 'heart' } });
    expect(within(screen.getByRole('group', { name: 'Emoji search results' }))
      .getByRole('button', { name: 'Insert ❤️' })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'сердце' } });
    expect(within(screen.getByRole('group', { name: 'Emoji search results' }))
      .getByRole('button', { name: 'Insert ❤️' })).toBeInTheDocument();
  });

  it('searches emoji names in Russian and keeps the picker open when there are no matches', () => {
    render(<QuickPlannerMockup />);
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
    render(<QuickPlannerMockup />);
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.change(editor, { target: { value: 'Hi ' } });
    (editor as HTMLTextAreaElement).setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Open emoji window' }));
    const modifierHint = screen.getByText('Hold Ctrl to add more');
    expect(modifierHint).toBeInTheDocument();
    expect(modifierHint.closest('.quick-planner-mockup-emoji-recent-heading')).not.toBeNull();

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
    render(<QuickPlannerMockup />);
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
    const onSendNow = vi.fn().mockResolvedValue(true);
    const onSchedule = vi.fn().mockResolvedValue(undefined);
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
        <QuickPlannerMockup
          chats={[chat]}
          selectedChat={chat}
          onSendNow={onSendNow}
          onSchedule={onSchedule}
          onSaveDraft={onSaveDraft}
        />
      </QuickPlannerNavigationContext.Provider>,
    );
    const editor = screen.getByRole('textbox', { name: 'Reminder text' });
    const submit = () => container.querySelector<HTMLButtonElement>('.quick-planner-mockup-schedule-row .quick-planner-mockup-submit')!;
    const selectEffect = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Message effects' }));
      fireEvent.click(screen.getByRole('button', { name }));
    };

    selectEffect('Fire');
    fireEvent.change(editor, { target: { value: 'Send from Planner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSendNow).toHaveBeenCalledWith(chat, 'Send from Planner');
    expect(openPosts).toHaveBeenLastCalledWith('sent');
    expect(screen.getByRole('button', { name: 'Message effects' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveClass('is-success');

    fireEvent.change(editor, { target: { value: 'Schedule from Planner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    selectEffect('Confetti');
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({
      chatId: chat.id,
      message: 'Schedule from Planner',
      date: expect.any(String),
      time: expect.any(String),
    }));
    expect(openPosts).toHaveBeenLastCalledWith('scheduled');
    expect(screen.getByRole('button', { name: 'Message effects' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveClass('is-success');

    fireEvent.change(editor, { target: { value: 'Save from Planner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await act(async () => {
      fireEvent.click(submit());
      await Promise.resolve();
    });
    expect(onSaveDraft).toHaveBeenCalledWith({ message: 'Save from Planner', attachments: [] });
    expect(openPosts).toHaveBeenLastCalledWith('drafts');
  });

  it('uses the first chat-name letter in placeholder avatars', () => {
    const chat: Chat = { id: 'chat-1', name: 'Design group', type: 'group' };
    const { container } = render(<QuickPlannerMockup chats={[chat]} selectedChat={chat} />);

    expect(container.querySelector('.quick-planner-mockup-chat > .quick-planner-mockup-chat-avatar')).toHaveTextContent('D');
    fireEvent.click(container.querySelector('.quick-planner-mockup-chat')!);
    const chatOption = screen.getByRole('option', { name: /Design group/ });
    expect(chatOption.querySelector('.quick-planner-mockup-chat-avatar')).toHaveTextContent('D');
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
        <QuickPlannerMockup />
      </QuickPlannerNavigationContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(screen.getByRole('status')).toHaveTextContent('Write text before continuing to Studio.');
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
        <QuickPlannerMockup onOpenInStudio={onOpenInStudio} />
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

  it('starts one minute ahead and clamps manually entered past times', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 10, 0));
    render(<QuickPlannerMockup />);
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
    render(<QuickPlannerMockup />);
    const timeTrigger = screen.getByRole('button', { name: 'Choose time' });

    expect(timeTrigger).toHaveTextContent('10:15');
    act(() => vi.advanceTimersByTime(60_025));

    expect(timeTrigger).toHaveTextContent('10:15');
  });

  it('sets NOW to one minute after the current time', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 10, 10, 0));
    const chat: Chat = { id: 'chat-1', name: 'Studio channel', type: 'channel' };
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(<QuickPlannerMockup chats={[chat]} onSchedule={onSchedule} />);

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
    render(<QuickPlannerMockup />);
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