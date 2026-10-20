import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@studio/types';
import { useStudioScheduler } from './useStudioScheduler';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { publishToChannel, scheduleToChannel } = vi.hoisted(() => ({
  publishToChannel: vi.fn(),
  scheduleToChannel: vi.fn(),
}));

vi.mock('@studio/services/publishingService', () => ({
  publishToChannel,
  scheduleToChannel,
}));

vi.mock('@studio/lib/i18n', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

const chat: Chat = { id: 'chat-1', name: 'Test chat', type: 'group' };

function renderScheduler(showNotification = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let current!: ReturnType<typeof useStudioScheduler>;
  function Harness() {
    current = useStudioScheduler({
      accountId: 'account-1',
      chats: [chat],
      selectedChat: chat,
      showNotification,
    });
    return null;
  }
  act(() => root.render(createElement(Harness)));
  return {
    get result() { return current; },
    showNotification,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useStudioScheduler bridge errors', () => {
  beforeEach(() => {
    publishToChannel.mockReset();
    scheduleToChannel.mockReset();
  });

  it('preserves adapter FloodWait details in the Host/Studio notification', async () => {
    const errorDetails = {
      operation: 'publish' as const,
      category: 'flood' as const,
      retryable: true,
      message: 'Wait before retrying.',
      code: 'TELEGRAM_FLOOD_WAIT',
      waitSeconds: 12,
    };
    publishToChannel.mockResolvedValueOnce({
      publishResult: { ok: false, provider: 'telegram', error: errorDetails.message, errorDetails },
    });
    const { result, showNotification, unmount } = renderScheduler();

    await act(async () => {
      expect(await result.handleSendDraftNow(chat, 'Hello')).toBe(false);
    });

    expect(showNotification).toHaveBeenCalledWith(errorDetails.message, 'error', 'Studio', errorDetails);
    unmount();
  });

  it('sends each photo album separately and puts the caption on the first album only', async () => {
    publishToChannel
      .mockResolvedValueOnce({ publishResult: { ok: true, provider: 'telegram', messageId: '201' } })
      .mockResolvedValueOnce({ publishResult: { ok: true, provider: 'telegram', messageId: '202' } });
    const replyMarkup = { inline_keyboard: [[{ text: 'Open', url: 'https://example.com' }]] };
    const entities = [{ type: 'bold', offset: 0, length: 11 }];
    const scheduler = renderScheduler();

    await act(async () => {
      expect(await scheduler.result.handleSendDraftNow(
        chat,
        'Album caption',
        ['a1', 'a2', 'b1', 'b2'],
        entities,
        replyMarkup,
        [['a1', 'a2'], ['b1', 'b2']],
      )).toBe(true);
    });

    expect(publishToChannel).toHaveBeenCalledTimes(2);
    expect(publishToChannel.mock.calls.map(([input]) => input.mediaIds)).toEqual([['a1', 'a2'], ['b1', 'b2']]);
    expect(publishToChannel.mock.calls.map(([input]) => input.body)).toEqual(['Album caption', '']);
    expect(publishToChannel.mock.calls.map(([input]) => input.entities)).toEqual([entities, []]);
    expect(publishToChannel.mock.calls.map(([input]) => input.replyMarkup)).toEqual([replyMarkup, undefined]);
    expect(scheduler.result.sent).toHaveLength(2);
    scheduler.unmount();
  });

  it('forwards the selected Telegram effect when sending from Studio', async () => {
    publishToChannel.mockResolvedValueOnce({
      publishResult: { ok: true, provider: 'telegram', messageId: '203' },
    });
    const scheduler = renderScheduler();

    await act(async () => {
      expect(await scheduler.result.handleSendDraftNow(
        chat,
        'Effect caption',
        [],
        [],
        undefined,
        undefined,
        undefined,
        '123456789',
      )).toBe(true);
    });

    expect(publishToChannel).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Effect caption',
      effect: '123456789',
    }));
    expect(scheduler.result.sent[0]).toMatchObject({ effect: '123456789' });
    scheduler.unmount();
  });

  it('reports an invalid schedule as a non-retryable validation error', async () => {
    const { result, showNotification, unmount } = renderScheduler();

    await act(async () => {
      await result.handleSchedule({
        chatId: chat.id,
        message: 'Hello',
        date: '2000-01-01',
        time: '00:00',
      });
    });

    expect(showNotification).toHaveBeenCalledWith('Дата и время должны быть в будущем.', 'error', 'Studio', {
      operation: 'validate',
      category: 'validation',
      retryable: false,
      message: 'Дата и время должны быть в будущем.',
      code: 'SCHEDULE_NOT_IN_FUTURE',
    });
    unmount();
  });

  it('schedules each photo album separately at the same time', async () => {
    scheduleToChannel
      .mockResolvedValueOnce({ publishResult: { ok: true, confirmed: true, messageId: '101' } })
      .mockResolvedValueOnce({ publishResult: { ok: true, confirmed: true, messageId: '102' } })
      .mockResolvedValueOnce({ publishResult: { ok: true, confirmed: true, messageId: '103' } });
    const scheduler = renderScheduler();

    await act(async () => {
      await scheduler.result.handleSchedule({
        chatId: chat.id,
        message: 'Album post',
        date: '2099-01-15',
        time: '17:42',
        attachments: ['a1', 'a2', 'b1', 'b2', 'c1'],
        attachmentGroups: [['a1', 'a2'], ['b1', 'b2'], ['c1']],
        entities: [{ type: 'bold', offset: 0, length: 5 }],
      });
    });

    expect(scheduleToChannel).toHaveBeenCalledTimes(3);
    expect(scheduleToChannel.mock.calls.map(([input]) => input.mediaIds)).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
      ['c1'],
    ]);
    expect(scheduleToChannel.mock.calls.map(([input]) => input.body)).toEqual(['Album post', '', '']);
    expect(new Set(scheduleToChannel.mock.calls.map(([input]) => input.scheduleAt)).size).toBe(1);
    expect(scheduler.result.upcoming).toHaveLength(3);
    expect(scheduler.result.upcoming.map((item) => item.telegramMessageId)).toEqual(['101', '102', '103']);
    scheduler.unmount();
  });

  it('still schedules text-only messages when attachment groups are empty', async () => {
    scheduleToChannel.mockResolvedValueOnce({
      publishResult: { ok: true, confirmed: true, messageId: '100' },
    });
    const scheduler = renderScheduler();

    await act(async () => {
      await scheduler.result.handleSchedule({
        chatId: chat.id,
        message: 'Text only',
        date: '2099-01-15',
        time: '17:42',
        attachmentGroups: [],
      });
    });

    expect(scheduleToChannel).toHaveBeenCalledOnce();
    expect(scheduleToChannel.mock.calls[0][0].mediaIds).toEqual([]);
    expect(scheduler.result.upcoming).toHaveLength(1);
    scheduler.unmount();
  });

  it('forwards Telegram effect IDs into scheduled posts and history', async () => {
    scheduleToChannel.mockResolvedValueOnce({
      publishResult: { ok: true, confirmed: true, messageId: '104' },
    });
    const scheduler = renderScheduler();

    await act(async () => {
      await scheduler.result.handleSchedule({
        chatId: chat.id,
        message: 'Effect schedule',
        date: '2099-01-15',
        time: '17:42',
        effect: '123456789',
      });
    });

    expect(scheduleToChannel).toHaveBeenCalledWith(expect.objectContaining({ effect: '123456789' }));
    expect(scheduler.result.upcoming[0]).toMatchObject({ effect: '123456789' });
    scheduler.unmount();
  });
});