import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, ScheduledMessage } from '@/types';
import { LocaleProvider } from '@/lib/i18n';
import { HistoryDrawer } from './HistoryDrawer';
import { normalizePlannerDraft, normalizeSavedDraft, normalizeSavedPlannerDraft, normalizeScheduledMessages, sortHistoryItems } from './historyModel';

const scheduledMessage: ScheduledMessage = {
  id: 'scheduled-studio-1',
  chatId: 'chat-1',
  chatName: 'XMSGi Updates',
  text: 'Релиз нового набора шаблонов для Telegram-канала',
  attachments: ['C:\\files\\brief.pdf'],
  when: '2026-09-29T17:30:00.000Z',
  createdAt: '2026-09-29T16:00:00.000Z',
  status: 'confirmed',
};

const channel: Chat = { id: 'chat-1', name: 'XMSGi Updates', username: 'xmsgi_updates', type: 'channel' };
const upcomingRecord = normalizeScheduledMessages([scheduledMessage], 'workspace', 'upcoming', [channel])[0];

const completedRecord = normalizeScheduledMessages([{
    ...scheduledMessage,
    id: 'completed-personal-1',
    chatName: 'Личные заметки',
    text: 'Подтвердить встречу',
    attachments: [],
    status: 'sent',
  }], 'personal', 'sent', [channel])[0];

const workspaceSentRecord = normalizeScheduledMessages([{
  ...scheduledMessage,
  id: 'completed-studio-1',
  status: 'sent',
}], 'workspace', 'sent', [channel])[0];

const personalUpcomingRecord = normalizeScheduledMessages([{
    ...scheduledMessage,
    id: 'scheduled-personal-1',
    chatName: 'Личное',
    text: 'Подтвердить встречу',
    attachments: [],
  }], 'personal', 'upcoming', [])[0];

describe('App-owned history mapping', () => {
  it('normalizes forbidden symbols in scheduled posts and preserves original source data', () => {
    const sourceMessage = {
      ...scheduledMessage,
      text: 'A\u200BB\u00A0C',
      entities: [{ type: 'bold' as const, offset: 2, length: 1 }],
    };
    const [record] = normalizeScheduledMessages([sourceMessage], 'workspace', 'sent', [channel]);

    expect(record.text).toBe('AB C');
    expect(record.entities).toEqual([{ type: 'bold', offset: 1, length: 1 }]);
    expect(record.original.kind === 'scheduled' && record.original.message.text).toBe(sourceMessage.text);
  });

  it('renders loaded Markdown templates as formatted post history text', () => {
    const [record] = normalizeScheduledMessages([{
      ...scheduledMessage,
      text: '**ДЕЙСТВУЙ**\n**[Название]**\n[Главный результат]',
    }], 'workspace', 'sent', [channel]);

    expect(record.text).toBe('ДЕЙСТВУЙ\n[Название]\n[Главный результат]');
    expect(record.entities).toEqual([
      { type: 'bold', offset: 0, length: 8 },
      { type: 'bold', offset: 9, length: 10 },
    ]);
  });

  it('preserves attachments in planner draft history so either editor can restore them', () => {
    const record = normalizePlannerDraft(
      'Проверяем откат текста',
      channel,
      '2026-09-29T18:00:00.000Z',
      [{ type: 'bold', offset: 0, length: 9 }],
      ['C:\\files\\photo.png', 'C:\\files\\brief.pdf'],
    );

    expect(record).not.toBeNull();
    expect(record?.text).toBe('Проверяем откат текста');
    expect(record?.attachments).toEqual(['C:\\files\\photo.png', 'C:\\files\\brief.pdf']);
    expect(record?.original).toMatchObject({
      kind: 'planner-draft',
      text: 'Проверяем откат текста',
      attachments: ['C:\\files\\photo.png', 'C:\\files\\brief.pdf'],
    });
  });

});

function renderHistory(
  records = [upcomingRecord],
  onCancel = vi.fn(),
  onDelete = vi.fn(),
  onSendNow = vi.fn(),
  onOpenDraft = vi.fn(),
  onReschedule = vi.fn(),
  onClearSent = vi.fn(),
  onClearDrafts = vi.fn().mockResolvedValue(true),
  onCancelQueue = vi.fn().mockResolvedValue(true),
  onUseDraft = vi.fn(),
) {
  const onClose = vi.fn();
  const view = render(
    <LocaleProvider>
      <HistoryDrawer
        isOpen
        onClose={onClose}
        records={records}
        onCancel={onCancel}
        onReschedule={onReschedule}
        onSendNow={onSendNow}
        onDelete={onDelete}
        onOpenDraft={onOpenDraft}
        onUseDraft={onUseDraft}
        onClearSent={onClearSent}
        onClearDrafts={onClearDrafts}
        onCancelQueue={onCancelQueue}
      />
    </LocaleProvider>,
  );
  return { ...view, onClose, onCancel, onDelete, onSendNow, onOpenDraft, onUseDraft, onReschedule, onClearSent, onClearDrafts, onCancelQueue };
}

function renderHistoryPage(records = [upcomingRecord]) {
  const onClose = vi.fn();
  return render(
    <LocaleProvider>
      <HistoryDrawer
        isOpen
        pageMode
        onClose={onClose}
        records={records}
        onCancel={vi.fn()}
        onReschedule={vi.fn()}
        onSendNow={vi.fn()}
        onDelete={vi.fn()}
        onOpenDraft={vi.fn()}
        onClearSent={vi.fn()}
        onCancelQueue={vi.fn()}
      />
    </LocaleProvider>,
  );
}

function searchHistory(query: string) {
  renderHistory();
  fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по истории' }), {
    target: { value: query },
  });
}

describe('history drawer transient menus', () => {
  it('closes export menus when the drawer closes', () => {
    const renderDrawer = (isOpen: boolean) => (
      <LocaleProvider>
        <HistoryDrawer
          isOpen={isOpen}
          onClose={vi.fn()}
          records={[upcomingRecord]}
          onCancel={vi.fn()}
          onReschedule={vi.fn()}
          onSendNow={vi.fn()}
          onDelete={vi.fn()}
          onOpenDraft={vi.fn()}
          onClearSent={vi.fn()}
          onClearDrafts={vi.fn().mockResolvedValue(true)}
          onCancelQueue={vi.fn().mockResolvedValue(true)}
        />
      </LocaleProvider>
    );
    const view = render(renderDrawer(true));
    const exportButton = screen.getByRole('button', { name: 'Export current category' });

    fireEvent.click(exportButton);
    expect(view.container.querySelector('.history-export-menu')).toBeInTheDocument();

    view.rerender(renderDrawer(false));
    view.rerender(renderDrawer(true));

    expect(view.container.querySelector('.history-export-menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export current category' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Posts page split view', () => {
  beforeEach(() => {
    window.localStorage.removeItem('xmsgi-history-filters');
  });

  it('keeps section navigation above the list and search with the bottom actions', () => {
    const { container } = renderHistoryPage([upcomingRecord, workspaceSentRecord]);
    const controls = container.querySelector<HTMLDivElement>('.history-drawer-controls')!;
    const statusFilters = controls.querySelector<HTMLDivElement>('.history-status-filters')!;
    const recordList = container.querySelector<HTMLDivElement>('.history-record-list')!;
    const tools = container.querySelector<HTMLDivElement>('.history-drawer-tools')!;
    const footer = tools.querySelector<HTMLDivElement>('.history-drawer-footer')!;
    const searchDock = tools.querySelector<HTMLDivElement>('.history-search-dock')!;

    expect(controls).toContainElement(statusFilters);
    expect(controls.compareDocumentPosition(recordList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recordList.compareDocumentPosition(searchDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools).toContainElement(searchDock);
    expect(footer).not.toContainElement(statusFilters);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Post status' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Sent' }));
    expect(container.querySelector('.history-drawer-tools')).toBeInTheDocument();
    expect(container.querySelector('.history-delete-button')).toBeInTheDocument();
    expect(container.querySelector('.history-export-button')).toBeInTheDocument();
  });

  it('keeps the full list visible while showing the selected post details separately', () => {
    const secondRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'scheduled-studio-2',
      text: 'Вторая публикация остаётся в списке',
      when: '2026-09-30T17:30:00.000Z',
    }], 'workspace', 'upcoming', [channel])[0];
    const { container } = renderHistoryPage([upcomingRecord, secondRecord]);

    expect(container.querySelectorAll('.history-record')).toHaveLength(2);
    expect(screen.getByText('Select a post')).toBeInTheDocument();

    fireEvent.click(container.querySelector('.history-record-open')!);

    expect(container.querySelectorAll('.history-record')).toHaveLength(2);
    expect(screen.getAllByText('Релиз нового набора шаблонов для Telegram-канала').length).toBeGreaterThan(0);
    expect(screen.getByText('Вторая публикация остаётся в списке')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'brief.pdf' }))
      .toHaveAttribute('download', 'brief.pdf');
    expect(screen.getByRole('button', { name: 'Back to posts' })).toBeInTheDocument();
    expect(container.querySelector('.history-record-open')).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports arrow, Home, and End navigation across status tabs', () => {
    renderHistoryPage([upcomingRecord, workspaceSentRecord]);
    const scheduledTab = screen.getByRole('tab', { name: 'Scheduled' });
    const sentTab = screen.getByRole('tab', { name: 'Sent' });
    const draftsTab = screen.getByRole('tab', { name: 'Drafts' });

    expect(scheduledTab).toHaveAttribute('tabindex', '0');
    expect(sentTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(scheduledTab, { key: 'ArrowRight' });
    expect(sentTab).toHaveFocus();
    expect(sentTab).toHaveAttribute('aria-selected', 'true');
    expect(sentTab).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(sentTab, { key: 'End' });
    expect(draftsTab).toHaveFocus();
    expect(draftsTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(draftsTab, { key: 'ArrowRight' });
    expect(scheduledTab).toHaveFocus();
    expect(scheduledTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(scheduledTab, { key: 'Home' });
    expect(scheduledTab).toHaveFocus();
    expect(scheduledTab).toHaveAttribute('aria-selected', 'true');
  });

  it('focuses and selects the history query with Ctrl+F or Cmd+F', () => {
    renderHistoryPage([upcomingRecord]);
    const search = screen.getByRole('textbox', { name: 'Search history' }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'launch' } });

    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });

    expect(search).toHaveFocus();
    expect(search.selectionStart).toBe(0);
    expect(search.selectionEnd).toBe('launch'.length);
  });

  it('returns keyboard focus to the selected post after leaving mobile details', async () => {
    const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((media: string) => ({
        matches: media === '(max-width: 900px)',
        media,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      const { container } = renderHistoryPage([upcomingRecord]);
      const rowButton = container.querySelector('.history-record-open') as HTMLButtonElement;
      fireEvent.click(rowButton);
      fireEvent.click(screen.getByRole('button', { name: 'Back to posts' }));

      await waitFor(() => expect(container.querySelector('.history-record-open')).toHaveFocus());
    } finally {
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});

describe('history filter glass indicators', () => {
  it('keeps full Russian category labels accessible', () => {
    window.localStorage.removeItem('xmsgi-history-filters');
    window.localStorage.setItem('awaitmsg_locale', 'ru');
    const { container } = renderHistory([upcomingRecord, workspaceSentRecord]);
    const statusFilters = container.querySelector('.history-status-filters') as HTMLElement;
    const scheduledTab = statusFilters.querySelector('[data-history-filter="scheduled"]') as HTMLElement;

    expect(scheduledTab).toHaveAttribute('aria-label', 'План');
    expect(scheduledTab.querySelector('.history-status-label')?.textContent).toBe('План');
  });

  it('tracks the selected source and status filters', () => {
    window.localStorage.removeItem('xmsgi-history-filters');
    const { container } = renderHistory([upcomingRecord, workspaceSentRecord]);
    const sourceFilters = container.querySelector('.history-source-filters') as HTMLDivElement;
    const statusFilters = container.querySelector('.history-status-filters') as HTMLDivElement;
    const sourceIndicator = sourceFilters.querySelector<HTMLElement>('.history-glass-indicator');
    const statusIndicator = statusFilters.querySelector<HTMLElement>('.history-glass-indicator');

    expect(sourceIndicator?.dataset.activeFilter).toBe('all');
    expect(statusIndicator?.dataset.activeFilter).toBe('scheduled');
    expect(sourceIndicator?.style.opacity).toBe('1');
    expect(statusIndicator?.style.opacity).toBe('1');

    fireEvent.click(sourceFilters.querySelector('[data-history-filter="workspace"]')!);
    fireEvent.click(statusFilters.querySelector('[data-history-filter="sent"]')!);

    expect(sourceIndicator?.dataset.activeFilter).toBe('workspace');
    expect(statusIndicator?.dataset.activeFilter).toBe('sent');
  });

  it('keeps source totals inclusive of sent records while Scheduled is selected', () => {
    window.localStorage.setItem('xmsgi-history-filters', JSON.stringify({
      sourceFilter: 'all',
      statusFilter: 'scheduled',
    }));
    const { container } = renderHistory([completedRecord, workspaceSentRecord]);
    const sourceFilters = container.querySelector('.history-source-filters')!;

    expect(sourceFilters.querySelector('[data-history-filter="all"] .history-filter-count')).toHaveTextContent('2');
    expect(sourceFilters.querySelector('[data-history-filter="workspace"] .history-filter-count')).toHaveTextContent('1');
    expect(sourceFilters.querySelector('[data-history-filter="personal"] .history-filter-count')).toHaveTextContent('1');
  });

  it('opens on the Planner source until a user-selected source is saved across reopen', () => {
    window.localStorage.removeItem('xmsgi-history-filters');
    const renderDrawer = (isOpen: boolean, sourceFilterOnOpen?: 'personal' | 'workspace') => (
      <LocaleProvider>
        <HistoryDrawer
          isOpen={isOpen}
          sourceFilterOnOpen={sourceFilterOnOpen}
          onClose={vi.fn()}
          records={[upcomingRecord, personalUpcomingRecord]}
          onCancel={vi.fn()}
          onReschedule={vi.fn()}
          onSendNow={vi.fn()}
          onDelete={vi.fn()}
          onOpenDraft={vi.fn()}
          onClearSent={vi.fn()}
          onClearDrafts={vi.fn().mockResolvedValue(true)}
          onCancelQueue={vi.fn().mockResolvedValue(true)}
        />
      </LocaleProvider>
    );
    const { container, rerender } = render(renderDrawer(true, 'personal'));

    expect(container.querySelector('[data-history-filter="personal"]')).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-history-filter="workspace"]')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(container.querySelector('[data-history-filter="workspace"]')!);
    expect(container.querySelector('[data-history-filter="workspace"]')).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-history-filter="personal"]')).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(window.localStorage.getItem('xmsgi-history-filters') ?? '{}')).toMatchObject({
      sourceFilter: 'workspace',
      sourceFilterPinned: true,
    });

    rerender(renderDrawer(false));
    rerender(renderDrawer(true, 'personal'));
    expect(container.querySelector('[data-history-filter="workspace"]')).toHaveAttribute('aria-pressed', 'true');
    window.localStorage.removeItem('xmsgi-history-filters');
  });

  it('uses the active product source on first open even when an older source is pinned', () => {
    window.localStorage.setItem('xmsgi-history-filters', JSON.stringify({
      sourceFilter: 'workspace',
      sourceFilterPinned: true,
      statusFilter: 'scheduled',
    }));
    const { container } = render(
      <LocaleProvider>
        <HistoryDrawer
          isOpen
          sourceFilterOnOpen="personal"
          sourceFilterOnOpenMode="initial"
          onClose={vi.fn()}
          records={[upcomingRecord, personalUpcomingRecord]}
          onCancel={vi.fn()}
          onReschedule={vi.fn()}
          onSendNow={vi.fn()}
          onDelete={vi.fn()}
          onOpenDraft={vi.fn()}
          onClearSent={vi.fn()}
          onClearDrafts={vi.fn().mockResolvedValue(true)}
          onCancelQueue={vi.fn().mockResolvedValue(true)}
        />
      </LocaleProvider>,
    );

    expect(container.querySelector('[data-history-filter="personal"]')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('xmsgi-history-filters') ?? '{}')).toMatchObject({
      sourceFilter: 'personal',
      sourceFilterPinned: true,
    });
  });

  it('opens the requested Posts category and restores the saved category on close', () => {
    window.localStorage.setItem('xmsgi-history-filters', JSON.stringify({
      sourceFilter: 'all',
      statusFilter: 'scheduled',
    }));
    const renderDrawer = (isOpen: boolean, statusFilterOnOpen?: 'sent' | 'scheduled' | 'drafts') => (
      <LocaleProvider>
        <HistoryDrawer
          isOpen={isOpen}
          statusFilterOnOpen={statusFilterOnOpen}
          onClose={vi.fn()}
          records={[upcomingRecord, completedRecord, workspaceSentRecord]}
          onCancel={vi.fn()}
          onReschedule={vi.fn()}
          onSendNow={vi.fn()}
          onDelete={vi.fn()}
          onOpenDraft={vi.fn()}
          onClearSent={vi.fn()}
          onClearDrafts={vi.fn().mockResolvedValue(true)}
          onCancelQueue={vi.fn().mockResolvedValue(true)}
        />
      </LocaleProvider>
    );
    const { container, rerender } = render(renderDrawer(true, 'sent'));

    expect(container.querySelector('[data-history-filter="sent"]')).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-history-filter="scheduled"]')).toHaveAttribute('aria-selected', 'false');
    expect(JSON.parse(window.localStorage.getItem('xmsgi-history-filters') ?? '{}').statusFilter).toBe('scheduled');

    rerender(renderDrawer(false));
    expect(JSON.parse(window.localStorage.getItem('xmsgi-history-filters') ?? '{}').statusFilter).toBe('scheduled');
    rerender(renderDrawer(true));
    expect(container.querySelector('[data-history-filter="scheduled"]')).toHaveAttribute('aria-selected', 'true');
    window.localStorage.removeItem('xmsgi-history-filters');
  });

  it('bounces the selected status in place when clicked again', () => {
    window.localStorage.removeItem('xmsgi-history-filters');
    const { container } = renderHistory([upcomingRecord, workspaceSentRecord]);
    const selectedTab = container.querySelector<HTMLElement>('.history-status-tab[aria-selected="true"]')!;
    const surface = container.querySelector<HTMLElement>('.history-status-filters .history-glass-surface')!;
    const animate = vi.fn();
    Object.defineProperty(surface, 'animate', { configurable: true, value: animate });

    fireEvent.click(selectedTab);

    expect(animate).toHaveBeenCalledOnce();
    const [frames, timing] = animate.mock.calls[0];
    expect(frames).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'scale(1.075)', offset: 0.42 }),
      expect.objectContaining({ transform: 'scale(1.01)', offset: 0.72 }),
      expect.objectContaining({ transform: 'scale(1.02)', offset: 0.86 }),
      expect.objectContaining({ transform: 'scale(1)' }),
    ]));
    expect(frames.every((frame: Keyframe) => !String(frame.transform).includes('translate'))).toBe(true);
    expect(timing.duration).toBe(780);
    expect(timing.easing).toBe('cubic-bezier(0.33, 0, 0.67, 1)');
  });

  it('uses the same in-place bounce when the selected source is clicked again', () => {
    window.localStorage.removeItem('xmsgi-history-filters');
    const { container } = renderHistory([upcomingRecord, workspaceSentRecord]);
    const selectedTab = container.querySelector<HTMLElement>('.history-filter[aria-pressed="true"]')!;
    const surface = container.querySelector<HTMLElement>('.history-source-filters .history-glass-surface')!;
    const animate = vi.fn();
    Object.defineProperty(surface, 'animate', { configurable: true, value: animate });

    fireEvent.click(selectedTab);

    expect(animate).toHaveBeenCalledOnce();
    const [frames] = animate.mock.calls[0];
    expect(frames).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'scale(1.075)', offset: 0.42 }),
      expect.objectContaining({ transform: 'scale(1.01)', offset: 0.72 }),
    ]));
    expect(frames.every((frame: Keyframe) => !String(frame.transform).includes('translate'))).toBe(true);
  });
});

function mockHistoryRecordScroll(container: HTMLElement, recordBounds = { top: 350, height: 100 }, scale = 1) {
  const list = container.querySelector('.history-record-list') as HTMLDivElement;
  const record = list.querySelector('.history-record') as HTMLElement;
  const dateHeading = list.querySelector('.history-date-heading') as HTMLElement;
  const scrollTo = vi.fn();
  Object.defineProperties(list, {
    clientHeight: { configurable: true, value: 300 },
    offsetHeight: { configurable: true, value: 300 },
    scrollTop: { configurable: true, writable: true, value: 20 },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect(0, 100 * scale, 400 * scale, 300 * scale) },
    scrollTo: { configurable: true, value: scrollTo },
  });
  Object.defineProperty(record, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, recordBounds.top * scale, 400 * scale, recordBounds.height * scale),
  });
  Object.defineProperty(dateHeading, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 100 * scale, 400 * scale, 34 * scale),
  });
  return scrollTo;
}

function stubDownloads() {
  const blobs: Blob[] = [];
  const filenames: string[] = [];
  vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
    if (typeof handler === 'function') handler();
    return 0;
  }) as typeof window.setTimeout);
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:scheduled-export-${blobs.length}`;
  });
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    filenames.push(this.download);
  });

  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  return { blobs, filenames, anchorClick };
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('HistoryDrawer search', () => {
  beforeEach(() => {
    window.localStorage.removeItem('xmsgi-history-filters');
    window.localStorage.setItem('awaitmsg_locale', 'ru');
  });

  it('groups search and navigation controls in one dock below the records', () => {
    const { container } = renderHistory();
    const recordList = container.querySelector('.history-record-list')!;
    const searchDock = container.querySelector('.history-search-dock')!;
    const navigationDock = container.querySelector('.history-drawer-footer')!;
    const toolsDock = container.querySelector('.history-drawer-tools')!;

    expect(recordList.compareDocumentPosition(searchDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(searchDock.compareDocumentPosition(navigationDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(searchDock.parentElement).toBe(toolsDock);
    expect(navigationDock.parentElement).toBe(toolsDock);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('renders the history interface in English when English is selected', () => {
    window.localStorage.setItem('awaitmsg_locale', 'en');
    renderHistory();

    expect(screen.getByRole('dialog', { name: 'Posts' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search history' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scheduled' })).toBeInTheDocument();
  });

  it('hides the reminders category in Personal posts', () => {
    renderHistory([]);

    fireEvent.click(screen.getByRole('button', { name: 'Планер' }));

    expect(screen.queryByRole('tab', { name: /Напоминания/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /План/ })).toBeInTheDocument();
  });

  it('resets a previously selected reminders category when opening Posts', () => {
    window.localStorage.setItem('xmsgi-history-filters', JSON.stringify({
      sourceFilter: 'personal',
      statusFilter: 'notes',
    }));
    renderHistory([]);

    expect(screen.queryByRole('tab', { name: /Напоминания/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /План/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('restores the source and status tabs after remounting', () => {
    const draft = normalizeSavedDraft({
      id: 'persisted-history-draft',
      name: 'Persisted draft',
      body: 'Draft content',
      color: 'coral',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    });
    const firstView = renderHistory([upcomingRecord, draft]);
    fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
    firstView.unmount();

    const secondView = renderHistory([upcomingRecord, draft]);
    try {
      expect(screen.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('tab', { name: 'Черновики' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Persisted draft')).toBeInTheDocument();
    } finally {
      secondView.unmount();
    }
  });

  it('normalizes both sources without colliding on matching IDs', () => {
    const duplicateIdMessage = { ...scheduledMessage, id: '123' };
    const personal = normalizeScheduledMessages([duplicateIdMessage], 'personal', 'upcoming', []);
    const workspace = normalizeScheduledMessages([duplicateIdMessage], 'workspace', 'upcoming', []);

    expect(personal[0].source).toBe('personal');
    expect(workspace[0].source).toBe('workspace');
    expect(personal[0].id).not.toBe(workspace[0].id);
    expect(personal[0].status).toBe('scheduled');
  });

  it('normalizes persisted Studio drafts and sorts each category by its required time', () => {
    const draft = normalizeSavedDraft({
      id: 'draft-1',
      name: 'Launch note',
      body: 'A new feature is ready',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    });
    const scheduled = normalizeScheduledMessages([
      { ...scheduledMessage, id: 'later', when: '2026-09-29T21:00:00.000Z' },
      { ...scheduledMessage, id: 'sooner', when: '2026-09-29T20:00:00.000Z' },
    ], 'workspace', 'upcoming', []);
    const sent = normalizeScheduledMessages([
      { ...scheduledMessage, id: 'older', sentAt: '2026-09-29T16:00:00.000Z' },
      { ...scheduledMessage, id: 'newer', sentAt: '2026-09-29T17:00:00.000Z' },
    ], 'personal', 'sent', []);

    expect(draft).toMatchObject({ source: 'workspace', status: 'draft', title: 'Launch note' });
    expect(sortHistoryItems(scheduled, 'scheduled').map((item) => item.original.kind === 'scheduled' && item.original.message.id))
      .toEqual(['sooner', 'later']);
    expect(sortHistoryItems(sent, 'sent').map((item) => item.original.kind === 'scheduled' && item.original.message.id))
      .toEqual(['newer', 'older']);
    expect(sortHistoryItems([draft, normalizeSavedDraft({
      id: 'draft-2',
      name: 'Older note',
      body: 'Earlier',
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-29T17:00:00.000Z',
    })], 'drafts')[0].id).toBe(draft.id);
  });

  it('normalizes failed and cancelled statuses already present in runtime data', () => {
    const errorMessage = { ...scheduledMessage, status: 'failed' as ScheduledMessage['status'] };
    const cancelledMessage = { ...scheduledMessage, id: 'cancelled-runtime', status: 'cancelled' as ScheduledMessage['status'] };
    const [errorRecord] = normalizeScheduledMessages([errorMessage], 'workspace', 'upcoming', []);
    const [cancelledRecord] = normalizeScheduledMessages([cancelledMessage], 'workspace', 'upcoming', []);

    expect(errorRecord.status).toBe('failed');
    expect(cancelledRecord.status).toBe('cancelled');
    expect(sortHistoryItems([
      { ...errorRecord, updatedAt: '2026-09-29T18:00:00.000Z' },
      { ...cancelledRecord, updatedAt: '2026-09-29T19:00:00.000Z' },
      normalizeScheduledMessages([{ ...scheduledMessage, id: 'soon', when: '2026-09-29T20:00:00.000Z' }], 'workspace', 'upcoming', [])[0],
    ], 'scheduled').map((record) => record.status)).toEqual(['scheduled', 'cancelled', 'failed']);
  });

  it('hides failed retry attempts from scheduled history', () => {
    const retryFailure = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'failed-attempt-1',
      text: 'Неудачная повторная отправка',
      status: 'failed',
      lastError: 'Telegram rejected the previous attempt.',
      retryAction: 'send',
    }], 'workspace', 'upcoming', [channel])[0];

    renderHistory([upcomingRecord, retryFailure]);

    expect(screen.getByText('Релиз нового набора шаблонов для Telegram-канала')).toBeInTheDocument();
    expect(screen.queryByText('Неудачная повторная отправка')).not.toBeInTheDocument();
    expect(screen.queryByText('Telegram rejected the previous attempt.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument();
  });

  it('keeps drafts in a dedicated section instead of mixing them into the queue UI', async () => {
    const draft = {
      id: 'draft-queue-separate-1',
      name: 'Draft note',
      body: 'Draft body for separate history section',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    Object.defineProperty(window, 'draftStorage', {
      configurable: true,
      value: {
        load: async () => ({
          success: true,
          store: {
            schemaVersion: 1,
            migrationVersion: 1,
            savedDrafts: [draft],
            workspaceDraft: null,
          },
        }),
      },
    });

    renderHistory([upcomingRecord]);
    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));

    expect(await screen.findByText('Draft note')).toBeInTheDocument();
    expect(screen.queryByText(/Черновики вынесены отдельно/i)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Черновики' }).textContent).toContain('1');
    delete (window as { draftStorage?: unknown }).draftStorage;
  });

  it('opens the records list at the top', () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 640,
    });

    try {
      const props = {
        onClose: vi.fn(),
        records: [upcomingRecord, personalUpcomingRecord],
        onCancel: vi.fn(),
        onReschedule: vi.fn(),
        onSendNow: vi.fn(),
        onDelete: vi.fn(),
        onOpenDraft: vi.fn(),
        onClearSent: vi.fn(),
      };
      const view = render(<LocaleProvider><HistoryDrawer {...props} isOpen={false} /></LocaleProvider>);

      view.rerender(<LocaleProvider><HistoryDrawer {...props} isOpen /></LocaleProvider>);

      expect(view.container.querySelector('.history-record-list')?.scrollTop).toBe(0);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
      }
    }
  });

  it('finds records by scheduled time', () => {
    searchHistory('17:30');

    expect(screen.getByText('XMSGi Updates')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('finds records by message text', () => {
    searchHistory('шаблонов telegram');

    expect(screen.getByText('XMSGi Updates')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('finds records by chat name', () => {
    searchHistory('@xmsgi_updates');

    expect(screen.getByText('XMSGi Updates')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('finds records by attachment name', () => {
    searchHistory('brief.pdf');

    expect(screen.getByText('XMSGi Updates')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('finds Planner drafts by reminder type', () => {
    const plannerDraft = normalizePlannerDraft(
      'Собрать материалы',
      null,
      '2026-09-29T17:30:00.000Z',
      [],
      [],
      'meeting',
    );
    renderHistory(plannerDraft ? [plannerDraft] : []);
    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по истории' }), {
      target: { value: 'встреча' },
    });

    expect(screen.getByRole('article')).toHaveTextContent('Собрать материалы');
  });

  it('counts results within the selected category and clears an empty search', () => {
    renderHistory([upcomingRecord, personalUpcomingRecord, completedRecord]);
    expect(screen.getByText('Показано 2 из 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Планер' }));
    expect(screen.getByText('Показано 1 из 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));
    expect(screen.getByRole('menu', { name: 'Формат экспорта' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по истории' }), {
      target: { value: 'нет такого сообщения' },
    });

    expect(screen.getByText('Найдено 0 из 1')).toBeInTheDocument();
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Формат экспорта' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Показано 1 из 1')).toBeInTheDocument();
  });

  it('reserves the clear-button slot while the search is empty', () => {
    const { container } = renderHistory();
    const clearButton = container.querySelector<HTMLButtonElement>('.history-search-clear')!;

    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveClass('is-reserved');
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по истории' }), {
      target: { value: 'x' },
    });
    expect(clearButton).toBeEnabled();
    expect(clearButton).not.toHaveClass('is-reserved');
  });

  it('places the clear button beside the input and keeps the result count last', () => {
    const { container } = renderHistory();
    const input = screen.getByRole('textbox', { name: 'Поиск по истории' });
    const clearButton = screen.getByRole('button', { name: 'Очистить поиск' });
    const resultCount = container.querySelector('.history-result-count')!;

    expect(input.compareDocumentPosition(clearButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clearButton.compareDocumentPosition(resultCount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups a long history list by calendar day', () => {
    const nextDayRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'scheduled-next-day',
      when: '2026-09-30T17:30:00.000Z',
    }], 'workspace', 'upcoming', [channel])[0];
    renderHistory([upcomingRecord, nextDayRecord]);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('hides failed retry rows while keeping successful attachments and cancelled entries visible', () => {
    const failedRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'failed-compact-row',
      attachments: [],
      status: 'failed' as ScheduledMessage['status'],
      lastError: 'Telegram не подтвердил отправку.',
      retryAction: 'send',
    }], 'workspace', 'upcoming', [channel])[0];
    const cancelledRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'cancelled-compact-row',
      attachments: [],
      text: 'Cancelled entry remains visible',
      status: 'cancelled' as ScheduledMessage['status'],
    }], 'personal', 'upcoming', [])[0];
    const imageRecord = { ...upcomingRecord, attachments: ['C:\\files\\launch-image.png'] };

    renderHistory([imageRecord, failedRecord, cancelledRecord]);

    const attachmentPreview = screen.getByLabelText('1 вложение');
    expect(attachmentPreview).toBeInTheDocument();
    expect(attachmentPreview.querySelector('img')).toHaveAttribute('src', expect.stringContaining('launch-image.png'));
    fireEvent.error(attachmentPreview.querySelector('img') as HTMLImageElement);
    expect(attachmentPreview.querySelector('.history-record-attachment-image')).toHaveClass('is-unavailable');
    expect(screen.getAllByText(/Запланировано ·/)[0].parentElement).toHaveClass('history-record-meta');
    expect(screen.queryByText('Telegram не подтвердил отправку.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument();
    expect(screen.getByText('Cancelled entry remains visible')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('filters the single Posts list across All, Studio, and Planner sources', () => {
    renderHistory([upcomingRecord, personalUpcomingRecord]);

    expect(screen.getAllByRole('article')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('XMSGi Updates')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Планер' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article')).toHaveTextContent('Подтвердить встречу');

    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('shows the most recently created scheduled record first across Planner and Studio in All', () => {
    const olderPersonalRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'older-personal',
      chatName: 'Planner older',
      createdAt: '2026-10-05T10:00:00.000Z',
      when: '2026-10-13T23:17:00.000Z',
    }], 'personal', 'upcoming', [])[0];
    const newerStudioRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'newer-studio',
      chatName: 'Studio newer',
      createdAt: '2026-10-05T12:00:00.000Z',
      when: '2026-10-07T23:17:00.000Z',
    }], 'workspace', 'upcoming', [channel])[0];

    renderHistory([olderPersonalRecord, newerStudioRecord]);

    const titles = screen.getAllByRole('article').map((article) => (
      article.querySelector('.history-record-heading strong')?.textContent
    ));
    expect(titles).toEqual(['Studio newer', 'Planner older']);
  });

  it('shows Planner drafts beside Studio posts in the shared Posts history', () => {
    const plannerDraft = normalizePlannerDraft('A saved Planner draft', null, '2026-10-06T10:00:00.000Z', [], [], 'meeting');
    renderHistory([upcomingRecord, personalUpcomingRecord, ...(plannerDraft ? [plannerDraft] : [])]);

    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article')).toHaveTextContent('A saved Planner draft');
    expect(screen.getByLabelText('Встреча')).toHaveAttribute('data-reminder-type', 'meeting');
    fireEvent.click(screen.getByRole('button', { name: 'Планер' }));

    expect(screen.getByRole('tab', { name: 'Черновики' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Черновики' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article')).toHaveTextContent('A saved Planner draft');
  });

  it('shows saved Quick Planner drafts in Posts and offers both editor destinations', () => {
    const savedPlannerDraft = normalizeSavedPlannerDraft({
      id: 'saved-idea-1',
      message: 'An idea saved from Quick Planner',
      attachments: [],
      entities: [],
      reminderType: 'idea',
      savedAt: '2026-10-06T10:00:00.000Z',
    });
    const { onUseDraft } = renderHistory([savedPlannerDraft]);

    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
    expect(screen.getByRole('article')).toHaveTextContent('An idea saved from Quick Planner');
    expect(screen.getByLabelText('Идея')).toHaveAttribute('data-reminder-type', 'idea');
    fireEvent.click(screen.getByRole('button', { name: /Использовать черновик/ }));

    const chooser = screen.getByRole('menu', { name: /Saved Quick Planner draft/ });
    fireEvent.click(within(chooser).getByRole('menuitem', { name: 'Планер' }));

    expect(onUseDraft).toHaveBeenCalledWith(savedPlannerDraft, 'planner');
  });

  it('keeps Posts rendering for a legacy Quick Planner draft without a saved date', () => {
    const legacyDraft = normalizeSavedPlannerDraft({
      id: 'legacy-saved-idea',
      message: 'A legacy Planner draft without a date',
      attachments: [],
      entities: [],
      reminderType: null,
      savedAt: '',
    });
    renderHistory([legacyDraft]);

    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));

    expect(screen.getByRole('article')).toHaveTextContent('A legacy Planner draft without a date');
    expect(screen.getByRole('article').querySelector('time')).not.toHaveAttribute('datetime', '');
  });

  it.each([
    ['Планер', 'planner'],
    ['Студия', 'studio'],
  ] as const)('asks where to use a Quick Planner draft and opens it in %s', (destinationLabel, destination) => {
    const plannerDraft = normalizePlannerDraft(
      'An editable Quick Planner note',
      channel,
      '2026-10-06T10:00:00.000Z',
      [{ type: 'bold', offset: 3, length: 8 }],
      ['C:\\files\\planner-note.pdf'],
    );
    expect(plannerDraft).not.toBeNull();
    const { onUseDraft, onClose } = renderHistory([plannerDraft!]);
    fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));

    fireEvent.click(screen.getByRole('button', { name: `Использовать черновик: ${plannerDraft!.title}` }));

    const chooser = screen.getByRole('menu', { name: `Где открыть черновик «${plannerDraft!.title}»?` });
    expect(onUseDraft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(chooser).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(chooser).queryByRole('menuitem', { name: 'Отмена' })).not.toBeInTheDocument();
    expect(chooser.parentElement).toHaveClass('history-record-primary-wrap');
    fireEvent.click(within(chooser).getByRole('menuitem', { name: destinationLabel }));

    expect(onUseDraft).toHaveBeenCalledWith(plannerDraft, destination);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('mentions drafts in the empty Planner state', () => {
    renderHistory([upcomingRecord]);

    fireEvent.click(screen.getByRole('button', { name: 'Планер' }));

    expect(screen.getByText('Публикации и черновики планера появятся здесь.')).toBeInTheDocument();
  });

  it('places a personal scheduled send action in More and asks for confirmation', () => {
    const { onSendNow } = renderHistory([personalUpcomingRecord]);

    expect(screen.queryByRole('button', { name: 'Отправить сейчас' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Отправить сейчас' }));

    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить отправку' });
    expect(confirmation).toHaveAttribute('aria-modal', 'true');
    expect(within(confirmation).getByRole('button', { name: 'Отмена' })).toHaveFocus();
    expect(confirmation).toHaveTextContent(`Отправить публикацию в «${personalUpcomingRecord.title}» сейчас?`);
    expect(onSendNow).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Отправить сейчас' }));

    expect(onSendNow).toHaveBeenCalledWith(personalUpcomingRecord);
  });

  it('closes history layers in order when Escape is pressed', () => {
    const { onClose } = renderHistory([upcomingRecord]);

    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Формат экспорта' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Публикации' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Отменить' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog', { name: 'Подтвердить отмену публикации' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Публикации' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('makes Edit primary for Studio messages and moves Send now into Actions', () => {
    const onReschedule = vi.fn();
    const onSendNow = vi.fn();
    const { onClose } = renderHistory([upcomingRecord, personalUpcomingRecord], vi.fn(), vi.fn(), onSendNow, vi.fn(), onReschedule);

    const rescheduleButton = screen.getByRole('button', { name: 'Изменить: XMSGi Updates' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ещё' })[0]);
    expect(screen.getByRole('menuitem', { name: 'Отправить сейчас' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Изменить: XMSGi Updates' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Отправить сейчас' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить отправку' });
    expect(onSendNow).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Отправить сейчас' }));
    expect(onSendNow).toHaveBeenCalledWith(upcomingRecord);

    fireEvent.click(rescheduleButton);

    expect(onReschedule).toHaveBeenCalledWith(upcomingRecord);
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getAllByRole('button', { name: 'Ещё' })[1]);
    expect(screen.getByRole('menuitem', { name: 'Отправить сейчас' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить сейчас' })).not.toBeInTheDocument();
  });

  it('confirms before deleting the selected sent-history category', async () => {
    const onClearSent = vi.fn();
    renderHistory([completedRecord, workspaceSentRecord], undefined, undefined, undefined, undefined, undefined, onClearSent);
    fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));

    fireEvent.click(screen.getByRole('button', { name: 'Удалить историю отправленных' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление категории' });
    expect(confirmation).toHaveTextContent('Удалить 2 записи из истории?');
    expect(confirmation).toHaveTextContent('Сообщения в Telegram останутся.');
    expect(onClearSent).not.toHaveBeenCalled();

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Отмена' }));
    expect(onClearSent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить историю отправленных' }));
    const studioConfirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление категории' });
    expect(studioConfirmation).toHaveTextContent('Удалить 1 запись из истории?');
    fireEvent.mouseDown(studioConfirmation.parentElement!);
    expect(screen.queryByRole('alertdialog', { name: 'Подтвердить удаление категории' })).not.toBeInTheDocument();
    expect(onClearSent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить историю отправленных' }));
    const finalConfirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление категории' });
    fireEvent.click(within(finalConfirmation).getByRole('button', { name: 'Удалить 1 запись' }));
    await waitFor(() => expect(onClearSent).toHaveBeenCalledWith('workspace'));
  });

  it('confirms and clears all drafts as one category action', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    const drafts = [
      { id: 'draft-a', name: 'Draft A', body: 'Body A', createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-29T18:35:00.000Z' },
      { id: 'draft-b', name: 'Draft B', body: 'Body B', createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-29T18:36:00.000Z' },
    ];
    const onClearDrafts = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'draftStorage', {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue({ success: true, store: { schemaVersion: 1, migrationVersion: 1, savedDrafts: drafts, workspaceDraft: null } }) },
    });

    try {
      renderHistory([], undefined, undefined, undefined, undefined, undefined, vi.fn(), onClearDrafts);
      fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
      await screen.findByText('Draft A');
      fireEvent.click(screen.getByRole('button', { name: 'Удалить черновики' }));

      const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление категории' });
      expect(confirmation).toHaveTextContent('Удалить 2 черновика? Восстановление невозможно.');
      expect(confirmation).toHaveAttribute('aria-modal', 'true');
      expect(within(confirmation).getByRole('button', { name: 'Отмена' })).toHaveFocus();
      expect(onClearDrafts).not.toHaveBeenCalled();
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить 2 черновика' }));

      await waitFor(() => expect(onClearDrafts).toHaveBeenCalledOnce());
      expect(screen.queryByText('Draft A')).not.toBeInTheDocument();
      expect(screen.queryByText('Draft B')).not.toBeInTheDocument();
    } finally {
      if (originalDraftStorage) Object.defineProperty(window, 'draftStorage', originalDraftStorage);
      else Reflect.deleteProperty(window, 'draftStorage');
    }
  });

  it('deletes only the expanded sent record when the trash icon is used', async () => {
    const onDelete = vi.fn();
    renderHistory([completedRecord, workspaceSentRecord], vi.fn(), onDelete);
    fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть публикацию: Личные заметки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Личные заметки' }));

    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление записи' });
    expect(confirmation).toHaveTextContent('Удалить «Личные заметки» из истории?');
    expect(confirmation).toHaveTextContent('Сообщение в Telegram останется.');
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить запись' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(completedRecord));
  });

  it('deletes only the expanded draft when the trash icon is used', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    const draft = {
      id: 'single-delete-draft',
      name: 'Draft to delete',
      body: 'Saved content',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    const onDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'draftStorage', {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue({ success: true, store: { schemaVersion: 1, migrationVersion: 1, savedDrafts: [draft], workspaceDraft: null } }) },
    });

    try {
      renderHistory([], vi.fn(), onDelete);
      fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
      await screen.findByRole('button', { name: 'Открыть публикацию: Draft to delete' });
      fireEvent.click(screen.getByRole('button', { name: 'Открыть публикацию: Draft to delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Удалить Draft to delete' }));

      const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление записи' });
      expect(confirmation).toHaveTextContent('Удалить черновик «Draft to delete»? Восстановление невозможно.');
      expect([...confirmation.querySelectorAll('.history-record-confirmation-action')].map((button) => button.textContent?.trim()))
        .toEqual(['Удалить черновик', 'Отмена']);
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить черновик' }));

      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({
        id: 'workspace:draft:single-delete-draft',
        status: 'draft',
      })));
      expect(screen.queryByText('Draft to delete')).not.toBeInTheDocument();
    } finally {
      if (originalDraftStorage) Object.defineProperty(window, 'draftStorage', originalDraftStorage);
      else Reflect.deleteProperty(window, 'draftStorage');
    }
  });

  it('confirms cancellation of only Telegram-confirmed entries from the queue category', async () => {
    const queueRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      telegramMessageId: 'telegram-queue-1',
    }], 'workspace', 'upcoming', [channel])[0];
    const onCancelQueue = vi.fn().mockResolvedValue(true);
    renderHistory([queueRecord], undefined, undefined, undefined, undefined, undefined, undefined, undefined, onCancelQueue);

    fireEvent.click(screen.getByRole('button', { name: 'Отменить запланированные публикации' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить отмену очереди' });
    expect(confirmation).toHaveTextContent('Снять с расписания 1 запись в Telegram?');
    expect(onCancelQueue).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Отменить 1 запись' }));

    await waitFor(() => expect(onCancelQueue).toHaveBeenCalledWith([queueRecord]));
  });

  it('hides failed local schedule errors and retry actions from Posts', () => {
    const localFailure = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'ipc-schedule-failure',
      status: 'failed' as const,
      lastError: "Error invoking remote method 'telegram-schedule': Invalid IPC input: message is required",
      retryAction: 'schedule' as const,
      telegramMessageId: undefined,
    }], 'workspace', 'upcoming', [channel])[0];
    const onDelete = vi.fn();
    const onCancelQueue = vi.fn().mockResolvedValue(true);

    renderHistory([localFailure], undefined, onDelete, undefined, undefined, undefined, undefined, undefined, onCancelQueue);

    expect(screen.queryByText("Error invoking remote method 'telegram-schedule': Invalid IPC input: message is required")).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить планирование' })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onCancelQueue).not.toHaveBeenCalled();
  });

  it('shows valid queue entries but hides failed schedule retries', () => {
    const queueRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      telegramMessageId: 'telegram-queue-mixed',
    }], 'workspace', 'upcoming', [channel])[0];
    const localFailure = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'ipc-schedule-failure-mixed',
      text: 'Failed schedule that can be retried',
      status: 'failed' as const,
      retryAction: 'schedule' as const,
      telegramMessageId: undefined,
    }], 'workspace', 'upcoming', [channel])[0];
    const onDelete = vi.fn();
    const onCancelQueue = vi.fn().mockResolvedValue(true);

    renderHistory([queueRecord, localFailure], undefined, onDelete, undefined, undefined, undefined, undefined, undefined, onCancelQueue);

    expect(screen.getByText('Релиз нового набора шаблонов для Telegram-канала')).toBeInTheDocument();
    expect(screen.queryByText('Failed schedule that can be retried')).not.toBeInTheDocument();
    expect(screen.queryByText(/Error invoking remote method|Invalid IPC input/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить планирование' })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onCancelQueue).not.toHaveBeenCalled();
  });

  it('cancels only the expanded scheduled record from the queue trash action', async () => {
    const queueRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      telegramMessageId: 'telegram-queue-selected',
    }], 'workspace', 'upcoming', [channel])[0];
    const otherRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'other-queue-record',
      chatName: 'Other channel',
      telegramMessageId: 'telegram-queue-other',
    }], 'workspace', 'upcoming', [])[0];
    const onCancelQueue = vi.fn().mockResolvedValue(true);
    renderHistory([queueRecord, otherRecord], undefined, undefined, undefined, undefined, undefined, undefined, undefined, onCancelQueue);

    fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить XMSGi Updates' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить отмену публикации' });
    expect(confirmation).toHaveTextContent('Убрать публикацию «XMSGi Updates» из расписания Telegram?');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Отменить расписание' }));

    await waitFor(() => expect(onCancelQueue).toHaveBeenCalledWith([queueRecord]));
  });

  it('does not offer bulk cancellation for upcoming records', () => {
    const { container } = renderHistory([upcomingRecord, personalUpcomingRecord]);

    expect(screen.queryByRole('button', { name: 'Отменить все запланированные' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить историю отправленных' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить черновики' })).not.toBeInTheDocument();
    expect(container.querySelector('.history-delete-placeholder')).toBeInTheDocument();
  });

  it('hides failed retry attempts but keeps cancelled entries in scheduled history', () => {
    const failedRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      text: 'Failed entry for retry',
      status: 'failed' as ScheduledMessage['status'],
      lastError: 'Telegram is temporarily unavailable.',
      retryAction: 'send',
    }], 'personal', 'upcoming', [channel])[0];
    const cancelledRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'cancelled-history-entry',
      text: 'Cancelled entry remains visible',
      status: 'cancelled' as ScheduledMessage['status'],
    }], 'personal', 'upcoming', [channel])[0];
    const onSendNow = vi.fn();

    renderHistory([failedRecord, cancelledRecord], vi.fn(), vi.fn(), onSendNow);

    expect(screen.queryByRole('tab', { name: 'Ошибки' })).not.toBeInTheDocument();
    expect(screen.queryByText('Failed entry for retry')).not.toBeInTheDocument();
    expect(screen.getByText('Cancelled entry remains visible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить отправку' })).not.toBeInTheDocument();
    expect(onSendNow).not.toHaveBeenCalled();
  });

  it('shows Sending in the scheduled list without exposing another send action', () => {
    const sendingRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      status: 'sending' as ScheduledMessage['status'],
    }], 'workspace', 'upcoming', [channel])[0];
    renderHistory([sendingRecord]);

    expect(screen.queryByRole('tab', { name: 'Отправляется' })).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Отправляется');
    expect(screen.getByRole('button', { name: 'Отправляется…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Отправить сейчас' })).not.toBeInTheDocument();
  });

  it('uses Studio drafts in the composer and puts Edit and Delete in More', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    const draft = {
      id: 'studio-draft-1',
      name: 'Анонс функции',
      body: 'Скоро обновление',
      color: 'coral' as const,
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    const load = vi.fn().mockResolvedValue({
      success: true,
      store: { schemaVersion: 1, migrationVersion: 1, savedDrafts: [draft], workspaceDraft: null },
    });
    Object.defineProperty(window, 'draftStorage', {
      configurable: true,
      value: { load },
    });

    try {
      const onOpenDraft = vi.fn();
      const onUseDraft = vi.fn();
      const onDelete = vi.fn().mockResolvedValue(true);
      renderHistory([upcomingRecord], vi.fn(), onDelete, vi.fn(), onOpenDraft, vi.fn(), vi.fn(), vi.fn().mockResolvedValue(true), vi.fn().mockResolvedValue(true), onUseDraft);
      fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
      const draftCard = await screen.findByRole('article');
      expect(draftCard).toHaveClass('is-draft');
      expect(draftCard).toHaveAttribute('data-draft-color', 'coral');
      expect(screen.getByLabelText('Цвет черновика: coral')).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Использовать черновик: Анонс функции' }));

      expect(load).toHaveBeenCalledOnce();
      expect(onUseDraft).toHaveBeenCalledWith(expect.objectContaining({
        source: 'workspace',
        status: 'draft',
        original: { kind: 'saved-draft', draft: expect.objectContaining({ id: 'studio-draft-1' }) },
      }));
      expect(onOpenDraft).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
      expect(screen.queryByRole('menuitem', { name: 'Редактировать' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
      expect(onDelete).not.toHaveBeenCalled();
      const confirmation = screen.getByRole('alertdialog', { name: 'Подтвердить удаление записи' });
      expect(confirmation).toHaveTextContent('Удалить черновик «Анонс функции»? Восстановление невозможно.');
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить черновик' }));
      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' })));
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
    } finally {
      if (originalDraftStorage) {
        Object.defineProperty(window, 'draftStorage', originalDraftStorage);
      } else {
        Reflect.deleteProperty(window, 'draftStorage');
      }
    }
  });

  it('offers text and JSON export options', () => {
    renderHistory();

    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));

    expect(screen.getByText('Текущая категория: План')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как TXT (.txt)' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как JSON (.json)' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как TXT (.txt)' }))
      .toHaveAttribute('title', 'Лучше для чтения, печати и отправки человеку.');
    expect(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как JSON (.json)' }))
      .toHaveAttribute('title', 'Лучше для резервной копии и переноса данных.');
    expect(screen.queryByText('Завершённые')).not.toBeInTheDocument();
  });

  it('exports only the currently selected source, status, and search results', async () => {
    const downloads = stubDownloads();

    try {
      renderHistory([upcomingRecord, personalUpcomingRecord, completedRecord]);
      fireEvent.click(screen.getByRole('button', { name: 'Планер' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по истории' }), {
        target: { value: 'подтвердить' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));

      expect(screen.getByText('Текущая категория: Отправлено')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как JSON (.json)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Экспортировать текущую категорию' })).toBeEnabled();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как JSON (.json)' }));

      const payload = JSON.parse(await readBlob(downloads.blobs[0])) as {
        filters: { source: string; status: string; query: string };
        records: Array<{ id: string }>;
      };
      expect(payload.filters).toEqual({ source: 'personal', status: 'sent', query: 'подтвердить' });
      expect(payload.records.map((record) => record.id)).toEqual([completedRecord.id]);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('exports a readable text file with the full message and attachment names', async () => {
    const downloads = stubDownloads();

    try {
      renderHistory();
      fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как TXT (.txt)' }));

      expect(downloads.blobs[0].type).toBe('text/plain;charset=utf-8');
      expect(downloads.filenames[0]).toMatch(/xmsgi-scheduled-.*\.txt$/);
      const text = await readBlob(downloads.blobs[0]);
      expect(text).toContain('XMSGi — План');
      expect(text).toContain('Источник: Studio');
      expect(text).toContain('Чат: XMSGi Updates (@xmsgi_updates)');
      expect(text).toContain('Релиз нового набора шаблонов для Telegram-канала');
      expect(text).toContain('brief.pdf');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('exports only the expanded record with its title in the menu and filename', async () => {
    const downloads = stubDownloads();

    try {
      renderHistory([upcomingRecord, personalUpcomingRecord]);
      fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));
      fireEvent.click(screen.getByRole('button', { name: 'Экспортировать XMSGi Updates' }));

      const exportMenu = screen.getByRole('menu', { name: 'Формат экспорта' });
      expect(exportMenu).toHaveTextContent('Экспортируется: XMSGi Updates');
      expect(exportMenu).not.toHaveTextContent('Вся категория');
      expect(within(exportMenu).getAllByRole('menuitem')).toHaveLength(2);
      fireEvent.click(within(exportMenu).getByRole('menuitem', { name: 'Экспортировать «XMSGi Updates» как TXT (.txt)' }));

      expect(downloads.filenames[0]).toMatch(/xmsgi-scheduled-xmsgi-updates-.*\.txt$/i);
      const text = await readBlob(downloads.blobs[0]);
      expect(text).toContain('Всего: 1');
      expect(text).toContain('XMSGi Updates');
      expect(text).toContain('Релиз нового набора шаблонов для Telegram-канала');
      expect(text).not.toContain('Подтвердить встречу');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('exports saved drafts from the selected drafts category', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    const draft = {
      id: 'exported-studio-draft',
      name: 'Идея для следующего поста',
      body: 'Собрать заметки по обновлению.',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    Object.defineProperty(window, 'draftStorage', {
      configurable: true,
      value: {
        load: vi.fn().mockResolvedValue({
          success: true,
          store: { schemaVersion: 1, migrationVersion: 1, savedDrafts: [draft], workspaceDraft: null },
        }),
      },
    });

    try {
      renderHistory([]);
      fireEvent.click(screen.getByRole('tab', { name: 'Черновики' }));
      await screen.findByRole('article');
      const downloads = stubDownloads();
      fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как JSON (.json)' }));

      const payload = JSON.parse(await readBlob(downloads.blobs[0])) as {
        filters: { source: string; status: string };
        records: Array<{ status: string; text: string; title: string }>;
      };
      expect(payload.filters).toEqual({ source: 'all', status: 'drafts', query: '' });
      expect(payload.records).toMatchObject([{ status: 'draft', title: draft.name, text: draft.body }]);
      expect(downloads.filenames[0]).toMatch(/xmsgi-drafts-.*\.json$/);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      if (originalDraftStorage) {
        Object.defineProperty(window, 'draftStorage', originalDraftStorage);
      } else {
        Reflect.deleteProperty(window, 'draftStorage');
      }
    }
  });

  it('exports completed records separately in a readable text file', async () => {
    const downloads = stubDownloads();

    try {
      renderHistory([upcomingRecord, completedRecord]);
      fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));
      fireEvent.click(screen.getByRole('button', { name: 'Экспортировать текущую категорию' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Экспортировать текущий список как TXT (.txt)' }));

      expect(downloads.filenames[0]).toMatch(/xmsgi-sent-.*\.txt$/);
      const text = await readBlob(downloads.blobs[0]);
      expect(text).toContain('XMSGi — Отправлено');
      expect(text).toContain('Статус: Отправлено');
      expect(text).toContain('Подтвердить встречу');
      expect(text).not.toContain('Релиз нового набора шаблонов');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('asks for confirmation before destructive history actions', () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    renderHistory([upcomingRecord, completedRecord], onCancel, onDelete);

    fireEvent.click(screen.getAllByRole('button', { name: 'Ещё' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Отменить' }));
    expect(screen.getByRole('alertdialog', { name: 'Подтвердить отмену публикации' })).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить публикацию' }));
    expect(onCancel).toHaveBeenCalledWith(upcomingRecord);

    fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Ещё' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(screen.getByRole('alertdialog', { name: 'Подтвердить удаление' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить запись' }));
    expect(onDelete).toHaveBeenCalledWith(completedRecord);
  });

  it('hides failed records and their retry and history actions', () => {
    const failedRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'failed-history-delete',
      status: 'failed' as ScheduledMessage['status'],
      lastError: 'Telegram did not confirm that the reminder was saved.',
      retryAction: 'schedule',
    }], 'workspace', 'upcoming', [channel])[0];
    const onDelete = vi.fn();

    renderHistory([failedRecord], vi.fn(), onDelete);

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ещё' })).not.toBeInTheDocument();
    expect(screen.queryByText('Telegram did not confirm that the reminder was saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить планирование' })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('expands a post in place, hides following posts and restores them on collapse', () => {
    renderHistory([upcomingRecord, personalUpcomingRecord]);

    fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));

    expect(screen.getByRole('button', { name: 'Свернуть: XMSGi Updates' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Релиз нового набора шаблонов для Telegram-канала')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать полностью: Личное' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: XMSGi Updates' }));

    expect(screen.getByRole('button', { name: 'Показать полностью: Личное' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('collapses an expanded post from the empty rail beside its message', () => {
    const view = renderHistory([upcomingRecord, personalUpcomingRecord]);
    fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));
    const expandedBody = view.container.querySelector('.history-post-expanded')!;
    const bubble = expandedBody.querySelector('.history-post-bubble')!;
    const messageText = expandedBody.querySelector('.history-post-text')!;
    Object.defineProperty(bubble, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(100, 200, 240, 100),
    });

    fireEvent.click(messageText, { clientX: 20 });
    expect(screen.getByRole('article')).toHaveClass('is-expanded');

    fireEvent.click(expandedBody, { clientX: 20 });

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(view.container.querySelector('.history-record.is-expanded')).toBeNull();
  });

  it('restores the history list position after collapsing a full-size post', () => {
    const view = renderHistory([upcomingRecord]);
    mockHistoryRecordScroll(view.container);
    const list = view.container.querySelector('.history-record-list') as HTMLDivElement;

    fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));
    list.scrollTop = 180;
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть: XMSGi Updates' }));

    expect(list.scrollTop).toBe(20);
  });

  it.each([
    {
      name: 'summary row',
      record: upcomingRecord,
      status: null,
      trigger: 'Открыть публикацию: XMSGi Updates',
      bounds: { top: 350, height: 100 },
      scale: 1,
      expectedScrollTop: 70,
    },
    {
      name: 'summary row for a sent message',
      record: completedRecord,
      status: 'Отправлено',
      trigger: 'Открыть публикацию: Личные заметки',
      bounds: { top: 350, height: 100 },
      scale: 1,
      expectedScrollTop: 70,
    },
    {
      name: 'full-view action for a sent message',
      record: completedRecord,
      status: 'Отправлено',
      trigger: 'Показать полностью: Личные заметки',
      bounds: { top: 350, height: 100 },
      scale: 1,
      expectedScrollTop: 70,
    },
    {
      name: 'full-view action for a message taller than the viewport',
      record: completedRecord,
      status: 'Отправлено',
      trigger: 'Показать полностью: Личные заметки',
      bounds: { top: 250, height: 480 },
      scale: 1,
      expectedScrollTop: 350,
    },
    {
      name: 'full-view action at Electron zoom',
      record: completedRecord,
      status: 'Отправлено',
      trigger: 'Показать полностью: Личные заметки',
      bounds: { top: 350, height: 100 },
      scale: 0.7,
      expectedScrollTop: 70,
    },
  ])('keeps $name visible by scrolling only the history list', ({ record, status, trigger, bounds, scale, expectedScrollTop }) => {
    const view = renderHistory([record]);
    if (status) fireEvent.click(screen.getByRole('tab', { name: status }));
    const scrollTo = mockHistoryRecordScroll(view.container, bounds, scale);

    fireEvent.click(screen.getByRole('button', { name: trigger }));

    expect(scrollTo).toHaveBeenCalledWith({ top: expectedScrollTop, behavior: 'smooth' });
  });

  it('scrolls the history list to keep the opened actions menu visible', () => {
    const view = renderHistory([upcomingRecord]);
    const scrollTo = mockHistoryRecordScroll(view.container);
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('history-record-action-menu')
        ? new DOMRect(0, 350, 170, 100)
        : originalGetBoundingClientRect.call(this);
    });

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));

      expect(scrollTo).toHaveBeenCalledWith({ top: 70, behavior: 'smooth' });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('scrolls the history list to keep the opened actions menu visible at Electron zoom', () => {
    const view = renderHistory([upcomingRecord]);
    const scrollTo = mockHistoryRecordScroll(view.container, { top: 350, height: 100 }, 0.7);
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('history-record-action-menu')
        ? new DOMRect(0, 245, 119, 70)
        : originalGetBoundingClientRect.call(this);
    });

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));

      expect(scrollTo).toHaveBeenCalledWith({ top: 70, behavior: 'smooth' });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('re-aligns an expanded sent message when its image attachment loads', () => {
    const sentImageRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      id: 'sent-image-1',
      status: 'sent',
      sentAt: '2026-09-29T18:00:00.000Z',
      attachments: ['C:\\files\\sent-image.png'],
    }], 'personal', 'sent', [channel])[0];
    const view = renderHistory([sentImageRecord]);
    fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));
    const scrollTo = mockHistoryRecordScroll(view.container, { top: 350, height: 100 });

    fireEvent.click(screen.getByRole('button', { name: 'Показать полностью: XMSGi Updates' }));
    expect(scrollTo).toHaveBeenCalledOnce();

    fireEvent.load(screen.getByRole('img', { name: 'sent-image.png' }));

    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('collapses an expanded message when switching to a category that hides it', () => {
    renderHistory([upcomingRecord, completedRecord]);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть публикацию: XMSGi Updates' }));
    expect(screen.getByRole('article')).toHaveClass('is-expanded');

    fireEvent.click(screen.getByRole('tab', { name: 'Отправлено' }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article')).not.toHaveClass('is-expanded');
  });

  it('shows image attachments in the full post view', () => {
    const imageRecord = normalizeScheduledMessages([
      {
        ...scheduledMessage,
        text: 'A caption below the photo',
        attachments: ['C:\\files\\launch-image.png'],
        replyMarkup: { inline_keyboard: [[{ text: 'Open details', url: 'https://example.com' }]] },
      },
    ], 'workspace', 'upcoming', [channel])[0];
    const view = renderHistory([imageRecord]);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть публикацию: XMSGi Updates' }));

    expect(screen.getByRole('img', { name: 'launch-image.png' })).toHaveAttribute('src', 'file:///C:/files/launch-image.png');
    const bubble = view.container.querySelector('.history-post-bubble');
    expect(bubble?.firstElementChild).toHaveClass('history-post-attachments');
    expect(bubble?.querySelector('.history-post-text')).toHaveTextContent('A caption below the photo');
    expect(screen.getByLabelText('Inline keyboard preview')).toContainElement(screen.getByRole('button', { name: 'Open details' }));
  });

  it('does not repeat a chat name below an identical message title', () => {
    const savedMessagesRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      chatName: 'Saved Messages',
    }], 'workspace', 'upcoming', [])[0];
    const view = renderHistory([savedMessagesRecord]);

    expect(view.container.querySelector('.history-record-heading strong')).toHaveTextContent('Saved Messages');
    expect(view.container.querySelector('.history-record-chat')).toBeNull();
  });

  it('shows a magnified preview after hovering over history photos', () => {
    const imageRecord = normalizeScheduledMessages([{
      ...scheduledMessage,
      attachments: ['C:\\files\\launch-image.png'],
    }], 'workspace', 'upcoming', [channel])[0];
    const view = renderHistory([imageRecord]);
    const thumbnail = view.container.querySelector('.history-record-attachment-image img');
    if (!thumbnail) throw new Error('History photo thumbnail was not rendered.');
    vi.useFakeTimers();

    try {
      fireEvent.pointerEnter(thumbnail);
      act(() => vi.advanceTimersByTime(599));
      expect(document.body.querySelector('.message-attachment-preview')).toBeNull();

      act(() => vi.advanceTimersByTime(1));
      expect(document.body.querySelector('.message-attachment-preview img')).toHaveAttribute('src', 'file:///C:/files/launch-image.png');

      fireEvent.pointerLeave(thumbnail);
      expect(document.body.querySelector('.message-attachment-preview')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Открыть публикацию: XMSGi Updates' }));
      const fullSizeImage = screen.getByRole('img', { name: 'launch-image.png' });
      fireEvent.pointerEnter(fullSizeImage);
      act(() => vi.advanceTimersByTime(600));
      expect(document.body.querySelector('.message-attachment-preview img')).toHaveAttribute('src', 'file:///C:/files/launch-image.png');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows schedule time and status only once the post is expanded', () => {
    const view = renderHistory([upcomingRecord]);
    const openButton = screen.getByRole('button', { name: 'Открыть публикацию: XMSGi Updates' });

    expect(openButton.querySelector('.history-record-date')).not.toBeNull();
    expect(openButton.querySelector('.history-record-heading time')).not.toBeNull();

    fireEvent.click(openButton);

    expect(openButton.querySelector('.history-record-date')).toBeNull();
    expect(openButton.querySelector('.history-record-heading time')).toBeNull();
    expect(view.container.querySelector('.history-post-time-row time')).toBeVisible();
    expect(view.container.querySelector('.history-post-time-row')).toHaveTextContent('Запланировано');
  });
});