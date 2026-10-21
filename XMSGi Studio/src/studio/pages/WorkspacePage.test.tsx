import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, NotificationState, PersistedDraftStore, ScheduledMessage } from '@studio/types';
import type { StudioPlannerTextPayload } from '@shared/bridge';
import { readInitialWorkspaceDraft, type WorkspaceDraft } from '../lib/draftStore';
import { EDITOR_APPEARANCE_STORAGE_KEY, writeEditorAppearancePreferences } from '@shared/editorAppearance';
import { LocaleProvider } from '@studio/lib/i18n';
import { ConfirmDialogProvider } from '@/components/ConfirmDialog';
import { hasDraftContent, normalizeAttachments, readWorkspaceDraftStoreFallback, remapAttachmentPositions, WorkspacePage, writeWorkspaceDraftStoreFallback } from './WorkspacePage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chatA: Chat = {
  id: 'chat-1',
  name: 'Alpha Team',
  username: 'alpha',
  type: 'group',
  avatarDataUrl: '',
};

const baseNotification: NotificationState = {
  message: '',
  type: 'info',
  title: '',
  visible: false,
};

let inMemoryDraftStore: PersistedDraftStore;
const workspacePageStyles = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'WorkspacePage.css'), 'utf8');

function getInMemoryWorkspaceDraft(): WorkspaceDraft {
  const workspaceDraft = inMemoryDraftStore.workspaceDraft;
  if (!workspaceDraft || typeof workspaceDraft !== 'object') {
    throw new Error('Expected an in-memory workspace draft.');
  }
  return workspaceDraft as WorkspaceDraft;
}

function seedVersionHistoryDialogStore() {
  const currentDocumentId = 'history-dialog-current-document';
  const otherDocumentId = 'history-dialog-other-document';
  const createVersion = (documentId: string, body: string, createdAt: string) => ({
    id: `${documentId}-version`,
    documentId,
    createdAt,
    reason: 'edit' as const,
    snapshot: {
      documentId,
      body,
      entities: [],
      attachments: [],
      selectedChat: chatA,
      inlineButtons: [],
      date: '2026-10-20',
      time: '09:00',
      repeatMode: 'none' as const,
      repeatDays: [],
      repeatOccurrences: 1,
      savedAt: '12:00',
    },
  });

  inMemoryDraftStore = {
    schemaVersion: 3,
    migrationVersion: 1,
    savedDrafts: [],
    documentHistories: {
      [currentDocumentId]: [createVersion(currentDocumentId, 'Current historical document', '2026-10-01T12:00:00.000Z')],
      [otherDocumentId]: [createVersion(otherDocumentId, 'Other historical document', '2026-10-02T12:00:00.000Z')],
    },
    workspaceDraft: {
      documentId: currentDocumentId,
      body: 'Current editor document',
      entities: [],
      attachments: [],
      savedAt: '12:00',
    },
  };

  return { currentDocumentId, otherDocumentId };
}

async function renderWorkspacePage(overrides: Partial<React.ComponentProps<typeof WorkspacePage>> = {}) {
  const defaults: React.ComponentProps<typeof WorkspacePage> = {
    connected: false,
    chats: [chatA],
    selectedChat: chatA,
    setSelectedChat: vi.fn(),
    onAddChat: vi.fn(),
    onRemoveChat: vi.fn(),
    removeModal: { show: false, chat: null },
    setRemoveModal: vi.fn(),
    confirmRemoveChat: vi.fn(),
    upcoming: [],
    date: '2026-01-10',
    time: '09:00',
    scheduling: false,
    successPulse: false,
    lastAction: null,
    notification: baseNotification,
    closeNotification: vi.fn(),
    setDate: vi.fn(),
    setTime: vi.fn(),
    handleSchedule: vi.fn(),
    handleCancelMessage: vi.fn(),
    handleSendDraftNow: vi.fn().mockResolvedValue(true),
    publishingDraft: false,
  };

  const view = render(<LocaleProvider><ConfirmDialogProvider><WorkspacePage {...defaults} {...overrides} /></ConfirmDialogProvider></LocaleProvider>);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    rerender: (nextOverrides: Partial<React.ComponentProps<typeof WorkspacePage>> = {}) => act(() => {
      view.rerender(<LocaleProvider><ConfirmDialogProvider><WorkspacePage {...defaults} {...overrides} {...nextOverrides} /></ConfirmDialogProvider></LocaleProvider>);
    }),
    unmount: view.unmount,
  };
}

  async function openDraftsStage() {
    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      saveDraftOption.click();
    });
    const draftButton = Array.from(document.querySelectorAll('.workspace-page-action-left-group > button'))
      .find((button) => button.textContent?.trim() === 'Draft') as HTMLButtonElement;
    await act(async () => {
      draftButton.click();
    });
  }

  async function saveEditorAsDraft() {
    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => saveDraftOption.click());
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
  }

  async function editComposerText(text: string) {
    const editor = document.querySelector('[aria-label="Post content"]') as HTMLDivElement;
    await act(async () => {
      editor.textContent = text;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
  }

  async function waitForWorkspaceAutosave() {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    });
  }

describe('WorkspacePage main-screen flows', () => {
  it('does not hydrate the Studio editor from the shared Planner active draft', () => {
    localStorage.setItem('xmsgi:active-draft:v1', JSON.stringify({
      id: 'quick-planner:active',
      message: 'Planner message',
      entities: [],
      attachments: [{ name: 'removed.png', path: 'C:/photos/removed.png' }],
      selectedChatId: null,
      updatedAt: '2026-10-21T00:00:00.000Z',
    }));

    expect(readInitialWorkspaceDraft()).toEqual({});
  });

  it('preserves photo album identity when normalizing draft attachments', () => {
    const attachments = normalizeAttachments([{
      id: 'album-photo-1',
      name: 'photo.png',
      type: 'image',
      mimeType: 'image/png',
      path: '/stored/photo.png',
      size: 100,
      position: 0,
      albumId: 'album-1',
    }]);

    expect(attachments[0].albumId).toBe('album-1');
    expect(normalizeAttachments([{ name: 'legacy.png', path: '/stored/legacy.png' }])[0].albumId).toBeUndefined();
  });

  it('does not mount inactive stage panels while editing the main message', async () => {
    const { unmount } = await renderWorkspacePage();

    try {
      const stageContent = document.querySelector('.workspace-page-rich-text-stage-content');
      expect(stageContent?.childElementCount).toBe(0);
    } finally {
      unmount();
    }
  });

  it('does not show the local clock in Studio', async () => {
    const { unmount } = await renderWorkspacePage();

    try {
      expect(document.querySelector('.local-date-time-clock')).toBeNull();
    } finally {
      unmount();
    }
  });

  it('renders the main composer labels in the selected Russian locale', async () => {
    localStorage.setItem('awaitmsg_locale', 'ru');
    const { unmount } = await renderWorkspacePage();

    expect(document.querySelector('.workspace-page-editor-title-text')?.textContent).toBe('Создать публикацию');
    expect(document.querySelector('.workspace-page-publish-menu-toggle')?.getAttribute('aria-label'))
      .toBe('Другие действия с публикацией');
    unmount();
  });

  it('raises the publish menu above the editor toolbar and gives it an opaque background', async () => {
    const { unmount } = await renderWorkspacePage();
    const actionRow = document.querySelector('.workspace-page-action-row.workspace-page-schedule-row')!;
    const toggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    const raisedLayerRule = workspacePageStyles.match(/\.workspace-page-action-row\.workspace-page-schedule-row\.is-publish-menu-open\s*\{([^}]*)\}/)?.[1] ?? '';
    const compactMenuRule = workspacePageStyles.match(/\.workspace-page-publish-menu-compact\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(raisedLayerRule).toMatch(/z-index:\s*40/);
    expect(compactMenuRule).toMatch(/backdrop-filter:\s*none/);
    expect(compactMenuRule).toMatch(/rgba\(40, 49, 57, 1\)/);

    await act(async () => toggle.click());
    expect(actionRow.classList.contains('is-publish-menu-open')).toBe(true);
    expect(document.querySelector('.workspace-page-publish-menu')).not.toBeNull();

    await act(async () => toggle.click());
    expect(actionRow.classList.contains('is-publish-menu-open')).toBe(false);
    unmount();
  });

  it('keeps the live current action inside the editor and updates it with the selected chat', async () => {
    localStorage.setItem('awaitmsg_locale', 'en');
    const { rerender, unmount } = await renderWorkspacePage();

    try {
      const editorShell = document.querySelector('.workspace-page-editor-shell') as HTMLElement;
      const summary = editorShell.querySelector('.workspace-page-mode-summary') as HTMLElement;

      expect(summary).not.toBeNull();
      expect(document.querySelector('.workspace-page-editor-heading .workspace-page-mode-summary')).toBeNull();
      expect(summary.querySelector('strong')?.textContent).toContain('Alpha Team');

      const nextChat = { ...chatA, id: 'chat-2', name: 'Beta Team' };
      rerender({ selectedChat: nextChat, chats: [nextChat] });

      expect(editorShell.querySelector('.workspace-page-mode-summary strong')?.textContent).toContain('Beta Team');
    } finally {
      unmount();
    }
  });

  it('hides the chat name in the current action for Saved Messages', async () => {
    localStorage.setItem('awaitmsg_locale', 'en');
    const savedMessagesChat: Chat = { ...chatA, id: 'chat-saved', name: 'Saved Messages', type: 'private' };
    const { rerender, unmount } = await renderWorkspacePage();

    try {
      const editorShell = document.querySelector('.workspace-page-editor-shell') as HTMLElement;
      expect(editorShell.querySelector('.workspace-page-mode-summary strong')?.textContent).toContain('Alpha Team');

      rerender({ selectedChat: savedMessagesChat, chats: [savedMessagesChat] });

      const summary = editorShell.querySelector('.workspace-page-mode-summary strong')?.textContent ?? '';
      expect(summary).toBe('Send now');
      expect(summary).not.toContain('Saved Messages');
      expect(summary).not.toContain('·');
    } finally {
      unmount();
    }
  });

  it('keeps time and repeat stages at the workspace top after scrolling', async () => {
    localStorage.setItem('awaitmsg_locale', 'en');
    const { unmount } = await renderWorkspacePage();

    try {
      const workspaceMain = document.querySelector('.workspace-page-main') as HTMLElement;
      workspaceMain.scrollTop = 431;

      await act(async () => {
        (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
      });
      const scheduleOption = document.querySelector('.workspace-page-publish-option.is-scheduled') as HTMLButtonElement;
      await act(async () => scheduleOption.click());

      const scheduleControls = document.querySelectorAll('.workspace-page-schedule-compact-button');
      await act(async () => (scheduleControls[0] as HTMLButtonElement).click());
      expect(workspaceMain.scrollTop).toBe(0);

      workspaceMain.scrollTop = 431;
      await act(async () => (scheduleControls[1] as HTMLButtonElement).click());
      expect(workspaceMain.scrollTop).toBe(0);
    } finally {
      unmount();
    }
  });

  it('falls back to localStorage when the Electron bridge is unavailable', async () => {
    const store = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: { body: 'fallback content', savedAt: '12:00' },
      documentHistories: {},
    };

    writeWorkspaceDraftStoreFallback(store);

    expect(readWorkspaceDraftStoreFallback()).toEqual(store);

    const { unmount } = await renderWorkspacePage();

    expect(document.querySelector('.workspace-page-publish-menu-toggle')).not.toBeNull();
    unmount();
  });

  it('clears saved drafts through the history handler and preserves the workspace draft', async () => {
    const savedDraft = {
      id: 'history-clear-draft',
      documentId: 'history-clear-document',
      name: 'Saved draft',
      body: 'Saved content',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    const workspaceDraft = {
      body: 'Unsaved editor content',
      savedAt: '12:00',
      attachments: [],
    };
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [savedDraft],
      workspaceDraft,
      documentHistories: {},
    };
    let clearHistoryDrafts: (() => Promise<boolean>) | null = null;
    const { unmount } = await renderWorkspacePage({
      onRegisterHistoryDraftClearHandler: (handler) => { clearHistoryDrafts = handler; },
    });

    let cleared = false;
    await act(async () => {
      cleared = await clearHistoryDrafts?.() ?? false;
    });

    expect(cleared).toBe(true);
    expect(inMemoryDraftStore.savedDrafts).toEqual([]);
    expect(inMemoryDraftStore.workspaceDraft).toMatchObject({ body: 'Unsaved editor content' });
    expect(inMemoryDraftStore.documentHistories?.['history-clear-document']?.[0].snapshot).toMatchObject({ body: 'Saved content' });
    unmount();
  });

  it('deletes one saved draft through the history handler and keeps the others', async () => {
    const drafts = [
      { id: 'delete-one', documentId: 'delete-document', name: 'Delete one', body: 'Selected draft', createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-29T18:35:00.000Z' },
      { id: 'keep-one', name: 'Keep one', body: 'Other draft', createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-29T18:36:00.000Z' },
    ];
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: drafts,
      workspaceDraft: { body: 'Unsaved editor content', savedAt: '12:00', attachments: [] },
      documentHistories: {},
    };
    let deleteHistoryDraft: ((draftId: string) => Promise<boolean>) | null = null;
    const { unmount } = await renderWorkspacePage({
      onRegisterHistoryDraftDeleteHandler: (handler) => { deleteHistoryDraft = handler; },
    });

    let deleted = false;
    await act(async () => {
      deleted = await deleteHistoryDraft?.('delete-one') ?? false;
    });

    expect(deleted).toBe(true);
    expect(inMemoryDraftStore.savedDrafts.map((draft: { id: string }) => draft.id)).toEqual(['keep-one']);
    expect(inMemoryDraftStore.workspaceDraft).toMatchObject({ body: 'Unsaved editor content' });
    expect(inMemoryDraftStore.documentHistories?.['delete-document']?.[0].snapshot).toMatchObject({ body: 'Selected draft' });
    unmount();
  });

  it('loads a saved draft into the main editor through the history use handler', async () => {
    const savedDraft = {
      id: 'use-in-composer',
      name: 'Composer draft',
      body: 'Text copied into the composer',
      entities: [],
      attachments: [],
      selectedChat: chatA,
      inlineButtons: [],
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [savedDraft],
      workspaceDraft: null,
    };
    let useHistoryDraft: ((draft: typeof savedDraft) => void) | null = null;
    const { unmount } = await renderWorkspacePage({
      onRegisterHistoryDraftUseHandler: (handler) => { useHistoryDraft = handler; },
    });

    await act(async () => {
      useHistoryDraft?.(savedDraft);
    });

    const editor = document.querySelector('[aria-label="Post content"]');
    expect(editor?.getAttribute('aria-hidden')).toBe('false');
    expect(editor?.textContent).toBe(savedDraft.body);
    expect(inMemoryDraftStore.savedDrafts[0]).toEqual(savedDraft);
    unmount();
  });

  it('activates the editor highlight from buttons and preserves it in other windows', async () => {
    const { unmount } = await renderWorkspacePage();
    const editor = document.querySelector<HTMLElement>('[aria-label="Post content"]')!;
    const editorShell = editor.closest('.workspace-page-rich-text-editor')!;

    expect(editorShell.classList.contains('is-toolbar-active')).toBe(false);
    const menuToggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    const historyScrollArea = document.createElement('div');
    historyScrollArea.className = 'history-record-list';
    historyScrollArea.style.overflowY = 'auto';
    Object.defineProperties(historyScrollArea, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
    });
    document.body.appendChild(historyScrollArea);
    await act(async () => {
      historyScrollArea.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(false);

    await act(async () => menuToggle.click());
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);
    await act(async () => menuToggle.click());
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);

    await act(async () => editor.focus());
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);

    await act(async () => menuToggle.click());
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);

    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => scheduleOption.click());
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);

    await act(async () => {
      historyScrollArea.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(true);

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(false);
    await act(async () => {
      historyScrollArea.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(editorShell.classList.contains('is-toolbar-active')).toBe(false);
    historyScrollArea.remove();
    unmount();
  });

  it('keeps the editor outline illuminated when toolbar focus is inactive', async () => {
    const { unmount } = await renderWorkspacePage();
    const editorShell = document.querySelector<HTMLElement>('.workspace-page-editor-shell')!;
    const editor = editorShell.querySelector('.workspace-page-rich-text-editor')!;
    const baseShellRule = workspacePageStyles.match(/\.workspace-page-editor-shell\s*\{([^}]*)\}/)?.[1] ?? '';
    const shellAfterRule = workspacePageStyles.match(/\.workspace-page-editor-shell::after\s*\{([^}]*)\}/)?.[1] ?? '';
    const outlineBaseRule = workspacePageStyles.match(/\.workspace-page-editor-shell\[data-editor-appearance='outline'\]\s*\{([^}]*)\}/)?.[1] ?? '';
    const outlineAfterRule = workspacePageStyles.match(/\.workspace-page-editor-shell\[data-editor-appearance='outline'\]::after\s*\{([^}]*)\}/)?.[1] ?? '';
    const toolbarRule = workspacePageStyles.match(/\.workspace-page-rich-text-toolbar\s*\{([^}]*)\}/)?.[1] ?? '';
    const lightEditorInputRule = workspacePageStyles.match(/\.workspace-page \.workspace-page-rich-text-input\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(editor.classList.contains('is-toolbar-active')).toBe(false);
    expect(baseShellRule).toMatch(/border:\s*1px solid rgba\(112, 130, 143, 0\.24\)/);
    expect(baseShellRule).toMatch(/0 0 0 1px rgba\(var\(--editor-outline\),\s*0\.04\)/);
    expect(baseShellRule).toMatch(/0 10px 28px rgba\(34, 47, 58, 0\.08\)/);
    expect(shellAfterRule).toMatch(/opacity:\s*1/);
    expect(shellAfterRule).toMatch(/border:\s*1px solid rgba\(var\(--editor-outline\),\s*0\.38\)/);
    expect(outlineBaseRule).toMatch(/border-color:\s*rgba\(var\(--editor-outline\),\s*0\.34\)/);
    expect(outlineBaseRule).toMatch(/0 0 0 1px rgba\(var\(--editor-outline\),\s*0\.06\)/);
    expect(outlineAfterRule).toMatch(/opacity:\s*0\.5/);
    expect(outlineAfterRule).toMatch(/border-color:\s*rgba\(var\(--editor-outline\),\s*0\.26\)/);
    expect(toolbarRule).toMatch(/opacity:\s*1/);
    expect(toolbarRule).toMatch(/visibility:\s*visible/);
    expect(toolbarRule).toMatch(/transform:\s*none/);
    expect(lightEditorInputRule).toMatch(/background:\s*#f7f8fa !important/);
    expect(lightEditorInputRule).toMatch(/border:\s*1px solid #e5e9ec/);
    expect(workspacePageStyles).toMatch(/workspace-page-rich-text-editor\.is-toolbar-active \.workspace-page-rich-text-input\s*\{[^}]*margin-bottom:\s*8px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-editor,\s*html\.electron-runtime \.workspace-page-rich-text-editor\.is-toolbar-active\s*\{\s*padding-bottom:\s*12px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-editor\.is-toolbar-active \.workspace-page-rich-text-input\s*\{\s*flex:\s*1 1 auto;\s*margin-bottom:\s*8px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-editor \.workspace-page-rich-text-toolbar\.is-airy,\s*html\.electron-runtime \.workspace-page-rich-text-editor\.is-toolbar-active \.workspace-page-rich-text-toolbar\.is-airy\s*\{\s*min-height:\s*34px;\s*margin:\s*12px 0 0 auto;\s*transform:\s*translateY\(8px\);/);
    expect(workspacePageStyles).not.toMatch(/\.workspace-page-attachment-tray\.is-empty\s*\{[^}]*display:\s*none/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page \.workspace-page-preview-panel\s*\{[^}]*width:\s*278px;[^}]*min-width:\s*278px;[^}]*max-width:\s*278px;[^}]*flex:\s*0 0 278px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page \.workspace-page-editor-shell\s*\{\s*max-height:\s*none;\s*margin-bottom:\s*0;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-stage:has\(\.workspace-page-rich-text-chat-stage\.is-active\)\s*\{\s*height:\s*100%;\s*min-height:\s*0;\s*max-height:\s*calc\(100% - 25px\);\s*margin-bottom:\s*-20px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-chat-stage\.is-active \.workspace-page-chat-stage-main\s*\{\s*flex:\s*1 1 0%;\s*min-height:\s*0;\s*overflow-y:\s*auto;/);
    expect(workspacePageStyles).toMatch(/\.workspace-page-editor-canvas:has\(\.workspace-page-rich-text-schedule-stage\.is-active:is\(\.is-time-focus, \.is-repeat-focus\)\) \.workspace-page-form-row-body\s*\{/);
    expect(workspacePageStyles).toMatch(/\.workspace-page-editor-shell:has\(\.workspace-page-rich-text-schedule-stage\.is-active\)\s*\{\s*width:\s*min\(100%, 815px\);/);

    unmount();
  });

  it('keeps the Schedule Time and Repeat controls fixed-size at compact Electron widths', () => {
    expect(workspacePageStyles).toMatch(/@media \(max-width: 840px\)[\s\S]*?html\.electron-runtime \.workspace-page-action-left-group \.workspace-page-schedule-compact-button\s*\{[^}]*flex:\s*0 0 80px !important;[^}]*width:\s*80px !important;[^}]*min-width:\s*80px !important;[^}]*font-size:\s*14px !important;/);
  });

  it('keeps the Electron post input inset and centered inside the editor stage', () => {
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-stage > \.workspace-page-textarea\.workspace-page-rich-text-stage-view\.is-active\s*\{[^}]*justify-self:\s*center;[^}]*width:\s*min\(calc\(92% \+ 24px\), 720px\);[^}]*max-width:\s*720px/);
  });

  it('keeps the Time picker and quick actions usable at the minimum Electron height', () => {
    expect(workspacePageStyles).toMatch(/@media \(max-width: 1100px\) and \(max-height: 540px\)[\s\S]*?html\.electron-runtime \.workspace-page-rich-text-stage:has\(\.workspace-page-rich-text-schedule-stage\.is-active\.is-time-focus\)\s*\{[^}]*min-height:\s*228px;[^}]*max-height:\s*228px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-schedule-stage\.is-time-focus \.workspace-page-schedule-main\s*\{[^}]*grid-template-rows:\s*36px minmax\(0, 1fr\);[^}]*grid-template-areas:[\s\S]*?'date-time date-time'[\s\S]*?'quick-time quick-date';[^}]*overflow-y:\s*auto;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-schedule-stage\.is-time-focus \.workspace-page-schedule-quick-date-panel,[\s\S]*?\.workspace-page-schedule-quick-time-panel\s*\{[^}]*display:\s*grid;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-stage:has\(\.workspace-page-rich-text-schedule-stage\.is-active\.is-repeat-focus\)\s*\{[^}]*min-height:\s*228px;[^}]*max-height:\s*228px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-rich-text-schedule-stage\.is-repeat-focus \.workspace-page-schedule-main\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
  });

  it('keeps the default blue accent when custom action colors are written', async () => {
    localStorage.removeItem(EDITOR_APPEARANCE_STORAGE_KEY);
    const { unmount } = await renderWorkspacePage();
    const editorShell = document.querySelector<HTMLElement>('.workspace-page-editor-shell')!;

    expect(editorShell.dataset.editorAppearance).toBe('outline');
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');

    await act(async () => {
      writeEditorAppearancePreferences({
        style: 'outline',
        palette: 'custom',
        modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
      });
    });

    expect(editorShell.dataset.editorAppearance).toBe('outline');
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');

    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const scheduleOption = document.querySelector<HTMLButtonElement>('.workspace-page-publish-option.is-scheduled')!;
    await act(async () => scheduleOption.click());
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');

    await act(async () => {
      writeEditorAppearancePreferences({
        style: 'monochrome',
        palette: 'custom',
        modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
      });
    });
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');

    unmount();
    localStorage.removeItem(EDITOR_APPEARANCE_STORAGE_KEY);
  });

  it('keeps the outline divider crisp over the subtle light editor surface', () => {
    const pageRule = workspacePageStyles.match(/\.workspace-page\s*\{([^}]*)\}/)?.[1] ?? '';
    const shellRule = workspacePageStyles.match(/\.workspace-page-editor-shell\s*\{([^}]*)\}/)?.[1] ?? '';
    const stageRule = workspacePageStyles.match(/\.workspace-page-rich-text-stage\s*\{([^}]*)\}/)?.[1] ?? '';
    const dividerRule = workspacePageStyles.match(/\.workspace-page-rich-text-stage::after\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(pageRule).toMatch(/radial-gradient\(ellipse 72% 62% at 45% 42%/);
    expect(pageRule).toMatch(/var\(--void\)/);
    expect(shellRule).toMatch(/radial-gradient\(ellipse 88% 48% at 50% 0%/);
    expect(shellRule).toMatch(/0 0 0 1px rgba\(var\(--editor-outline\), 0\.04\)/);
    expect(stageRule).toMatch(/rgba\(var\(--editor-outline-bright\), 0\.48\)/);
    expect(dividerRule).toMatch(/filter:\s*none/);
  });

  it('updates publish actions without changing the blue editor outline', async () => {
    const { unmount } = await renderWorkspacePage();
    const publishButton = document.querySelector('.workspace-page-publish-main')!;
    const editorShell = document.querySelector<HTMLElement>('.workspace-page-editor-shell')!;
    const menuToggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');
    expect(publishButton.classList.contains('is-send')).toBe(true);
    expect(editorShell.classList.contains('is-scheduled')).toBe(false);
    expect(editorShell.classList.contains('is-draft')).toBe(false);

    await act(async () => menuToggle.click());
    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => scheduleOption.click());
    expect(publishButton.classList.contains('is-scheduled')).toBe(true);
    expect(editorShell.classList.contains('is-scheduled')).toBe(true);
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');

    await act(async () => menuToggle.click());
    const draftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => draftOption.click());
    expect(publishButton.classList.contains('is-draft')).toBe(true);
    expect(editorShell.classList.contains('is-draft')).toBe(true);
    expect(editorShell.style.getPropertyValue('--editor-outline')).toBe('35, 157, 251');
    unmount();
  });

  it('keeps the browser runtime quiet when draft storage is unavailable', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    Reflect.deleteProperty(window, 'draftStorage');
    localStorage.removeItem('xmsgi-draft-store-fallback');
    localStorage.removeItem('awaitmsg-draft-store-fallback');

    try {
      const { unmount } = await renderWorkspacePage();
      expect(document.body.textContent).not.toContain('Saved drafts are unavailable in this runtime.');
      unmount();
    } finally {
      if (originalDraftStorage) {
        Object.defineProperty(window, 'draftStorage', originalDraftStorage);
      } else {
        Reflect.deleteProperty(window, 'draftStorage');
      }
    }
  });

  it('treats attachment-only drafts as valid content', () => {
    expect(hasDraftContent('', normalizeAttachments([{ name: 'demo.png', path: 'C:/demo/demo.png' }]))).toBe(true);
    expect(hasDraftContent('', normalizeAttachments([{ name: 'demo.png', previewUrl: 'data:image/png;base64,AAA' }]))).toBe(true);
    expect(hasDraftContent('', [])).toBe(false);
  });

  it('keeps browser fallback attachments that only have previewUrl data', () => {
    expect(normalizeAttachments([{ name: 'demo.png', previewUrl: 'data:image/png;base64,AAA' }])).toEqual([
      {
        id: 'legacy-0-demo.png',
        type: 'image',
        name: 'demo.png',
        mimeType: 'image/png',
        path: 'data:image/png;base64,AAA',
        size: 0,
        previewUrl: 'data:image/png;base64,AAA',
        position: 0,
      },
    ]);
  });

  it('keeps attachments anchored to their text when the body changes', () => {
    const attachments = normalizeAttachments([
      { id: 'before', name: 'before.png', path: '/before.png', position: 3 },
      { id: 'after', name: 'after.png', path: '/after.png', position: 6 },
    ]);

    expect(remapAttachmentPositions(attachments, 'Hello world', 'Hello brave world').map(({ id, position }) => ({ id, position })))
      .toEqual([{ id: 'before', position: 3 }, { id: 'after', position: 12 }]);
    expect(remapAttachmentPositions(attachments, 'Hello world', 'Hello world!')).toBe(attachments);
  });

  it('opens the compact schedule shell by default for the active preview state', async () => {
    document.body.dataset.livePreview = 'true';

    const { unmount } = await renderWorkspacePage();

    expect(document.querySelector('.workspace-page-rich-text-schedule-stage.is-active')).not.toBeNull();
    expect(document.querySelector('.workspace-page-schedule-empty-panel')).not.toBeNull();

    document.body.removeAttribute('data-live-preview');
    unmount();
  });

  it('opens the custom schedule calendar below its date field and selects today', async () => {
    document.body.dataset.livePreview = 'true';
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const setDate = vi.fn();
    const { unmount } = await renderWorkspacePage({ date: todayValue, setDate });
    const dateField = document.querySelector<HTMLElement>('.workspace-page-schedule-inline-date')!;
    const dateButton = dateField.querySelector<HTMLButtonElement>('button')!;
    vi.spyOn(dateField, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 320, 38));

    await act(async () => dateButton.click());

    const picker = document.querySelector<HTMLElement>('.quick-planner-date-picker')!;
    expect(picker.getAttribute('role')).toBe('dialog');
    expect(picker.style.top).toBe('144px');
    const todayButton = Array.from(picker.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === String(today.getDate()))!;
    expect(todayButton.disabled).toBe(false);

    await act(async () => todayButton.click());

    expect(setDate).toHaveBeenCalledWith(todayValue);
    expect(document.querySelector('.quick-planner-date-picker')).toBeNull();
    document.body.removeAttribute('data-live-preview');
    unmount();
  });

  it('opens the time list below its trigger and scrolls to the first available time', async () => {
    document.body.dataset.livePreview = 'true';
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const setTime = vi.fn();
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const { unmount } = await renderWorkspacePage({ date: todayValue, time: '00:00', setTime });
    const timeField = document.querySelector<HTMLElement>('.workspace-page-schedule-inline-time')!;
    const timeButton = timeField.querySelector<HTMLButtonElement>('button')!;
    vi.spyOn(timeField, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 220, 38));

    await act(async () => timeButton.click());

    const picker = document.querySelector<HTMLElement>('.workspace-page-schedule-time-picker')!;
    expect(picker.style.top).toBe('144px');
    const firstAvailableTime = picker.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)');
    expect(firstAvailableTime).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollIntoView.mock.instances[0]).toBe(firstAvailableTime);

    document.body.removeAttribute('data-live-preview');
    unmount();
    if (previousScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('hides the drafts control while the composer is in schedule mode', async () => {
    document.body.dataset.livePreview = 'true';
    try {
      const { unmount } = await renderWorkspacePage();
      const draftButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Draft');
      expect(draftButton).toBeUndefined();
      unmount();
    } finally {
      document.body.removeAttribute('data-live-preview');
    }
  });

  it('removes the legacy preview eyelashes and keeps the compact mode row flexible', async () => {
    localStorage.setItem('xmsgi-preview-layout', JSON.stringify({ visible: true }));
    const { unmount } = await renderWorkspacePage();
    const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="Hide preview"]');

    try {
      expect(toggle?.getAttribute('aria-label')).toBe('Hide preview');
      await act(async () => {
        toggle?.click();
      });

      expect(toggle?.getAttribute('aria-label')).toBe('Show preview');
      expect(toggle?.querySelector('.workspace-page-preview-eyelashes')).toBeNull();
      expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page-main:has\(\.workspace-page-preview-panel\[data-visible='false'\]\) \.workspace-page-editor-panel\s*\{\s*align-items:\s*center;/);

      const modeButtons = [...document.querySelectorAll('.workspace-page-mode-button, .workspace-page-schedule-compact-button')];
      expect(modeButtons.length).toBeGreaterThan(0);
      modeButtons.forEach((button) => {
        const style = getComputedStyle(button);
        expect(style.minWidth).not.toBe('96px');
        expect(style.flexBasis).not.toBe('96px');
      });
    } finally {
      unmount();
    }
  });

  it('aligns Electron editor and preview panel heights on desktop', () => {
    expect(workspacePageStyles).toMatch(/@media \(max-width: 1100px\)[\s\S]*?html\.electron-runtime \.workspace-page-main\s*\{[^}]*padding:\s*20px clamp\(10px, 1\.5vw, 16px\) 20px;/);
    expect(workspacePageStyles).toMatch(/@media \(min-width: 1101px\)[\s\S]*?html\.electron-runtime \.workspace-page-main\s*\{\s*padding-top:\s*32px;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page \.workspace-page-editor-panel\s*\{\s*height:\s*min\(100%, 655px\);\s*max-height:\s*655px;\s*align-self:\s*flex-start;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page \.workspace-page-editor-shell\s*\{\s*max-height:\s*none;\s*margin-bottom:\s*0;/);
    expect(workspacePageStyles).toMatch(/html\.electron-runtime \.workspace-page \.workspace-page-preview-panel:not\(\[data-collapsed='true'\]\)\s*\{\s*height:\s*min\(100%, 655px\);\s*max-height:\s*655px;\s*align-self:\s*flex-start;/);
  });

  it('aligns Studio editor and live preview heights on desktop', () => {
    expect(workspacePageStyles).toContain('height: min(535px, calc(100dvh - 172px));');
    expect(workspacePageStyles).toContain('height: min(535px, max(0px, calc(100dvh - 172px)));');
  });

  it('registers the existing draft editor for History Drawer draft actions', async () => {
    const registerDraftOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterHistoryDraftOpener: registerDraftOpener });
    const draft = {
      id: 'history-draft-1',
      name: 'History draft',
      body: 'Draft opened from history',
      createdAt: '2026-09-29T17:00:00.000Z',
      updatedAt: '2026-09-29T18:00:00.000Z',
    };

    expect(registerDraftOpener).toHaveBeenCalledWith(expect.any(Function));
    await act(async () => {
      registerDraftOpener.mock.calls[0][0](draft);
    });

    expect(document.querySelector('.workspace-page-rich-text-draft-stage.is-active')).not.toBeNull();
    unmount();
  });

  it('opens Planner text in the main Studio editor and reuses the same workspace draft', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = { schemaVersion: 2, migrationVersion: 1, savedDrafts: [], workspaceDraft: null };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    const payload = {
      text: 'Message from Quick Planner',
      attachments: ['C:/planner/brief.pdf'],
      entities: [{ type: 'bold' as const, offset: 0, length: 7 }],
      effect: '123456789',
    };

    expect(opener).toBeTypeOf('function');
    let opened = false;
    await act(async () => {
      opened = await opener!(payload);
    });

    expect(opened).toBe(true);
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent)
      .toContain('Message from Quick Planner');
    expect(document.querySelector('[aria-label="Message effects"]')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      opened = await opener!(payload);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });

    expect(opened).toBe(true);
    expect(getInMemoryWorkspaceDraft().body).toBe('Message from Quick Planner');
    expect(getInMemoryWorkspaceDraft().entities).toEqual(payload.entities);
    expect(getInMemoryWorkspaceDraft().attachments[0]).toMatchObject({
      path: '/stored/brief.pdf',
      sourcePath: payload.attachments[0],
      name: 'brief.pdf',
    });
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    unmount();
  });

  it('opens a photo-only Planner payload in Studio', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = { schemaVersion: 2, migrationVersion: 1, savedDrafts: [], workspaceDraft: null };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    let opened = false;
    await act(async () => {
      opened = await opener!({ text: '', attachments: ['C:/planner/photo.png'], entities: [] });
    });

    expect(opened).toBe(true);
    expect(window.draftStorage?.copyAttachmentPath).toHaveBeenCalledWith('C:/planner/photo.png');
    expect(document.querySelector('.workspace-page-attachment-name')).toHaveTextContent('photo.png');
    unmount();
  });

  it('preserves a different Studio document in history before opening Planner text without creating duplicate drafts', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: { body: 'Existing Studio document', attachments: [], savedAt: '12:00' },
    };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    let opened = true;
    await act(async () => {
      opened = await opener?.({ text: 'Planner document', attachments: [], entities: [] }) ?? true;
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });

    expect(opened).toBe(true);
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent)
      .toContain('Planner document');
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    expect(Object.values(inMemoryDraftStore.documentHistories ?? {}).flat().some((version) => (
      (version.snapshot as WorkspaceDraft).body === 'Existing Studio document'
    ))).toBe(true);
    expect(getInMemoryWorkspaceDraft().body).toBe('Planner document');

    await act(async () => {
      opened = await opener!({ text: 'Planner document', attachments: [], entities: [] });
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
    expect(opened).toBe(true);
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    expect(Object.values(inMemoryDraftStore.documentHistories ?? {}).flat().filter((version) => (
      (version.snapshot as WorkspaceDraft).body === 'Existing Studio document'
    ))).toHaveLength(1);
    unmount();
  });

  it('keeps existing Studio work when its history checkpoint fails before opening Planner text', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: { body: 'Keep this Studio document', attachments: [], savedAt: '12:00' },
    };
    vi.mocked(window.draftStorage.save).mockResolvedValueOnce({ success: false, error: 'Disk unavailable' });
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    let opened = true;
    await act(async () => {
      opened = await opener?.({ text: 'Do not lose this document', attachments: [], entities: [] }) ?? true;
    });

    expect(opened).toBe(false);
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent)
      .toContain('Keep this Studio document');
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    unmount();
  });

  it('restores the previous Studio document after successfully saving Planner text', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: {
        body: 'Previous Studio post',
        entities: [{ type: 'bold', offset: 0, length: 8 }],
        attachments: [{ name: 'original.pdf', path: 'C:/files/original.pdf' }],
        selectedChat: chatA,
        inlineButtons: [],
        date: '2026-01-10',
        time: '09:00',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 1,
        savedAt: '12:00',
      },
    };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;

    await act(async () => {
      expect(await opener!({ text: 'Planner post', attachments: [], entities: [] })).toBe(true);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
    await saveEditorAsDraft();

    expect(inMemoryDraftStore.savedDrafts.map((draft) => draft.body)).toEqual(['Planner post']);
    expect(getInMemoryWorkspaceDraft().body).toBe('Previous Studio post');
    const editor = document.querySelector('.workspace-page-rich-text-input.is-active');
    expect(editor?.textContent).toContain('Previous Studio post');
    expect(editor?.textContent).not.toContain('Planner post');
    expect(editor?.querySelector('strong')?.textContent).toBe('Previous');
    expect(document.body.textContent).toContain('original.pdf');
    expect(getInMemoryWorkspaceDraft()).toMatchObject({
      body: 'Previous Studio post',
      entities: [{ type: 'bold', offset: 0, length: 8 }],
      attachments: [expect.objectContaining({ path: '/stored/original.pdf', sourcePath: 'C:/files/original.pdf' })],
      selectedChat: chatA,
      date: '2026-01-10',
      time: '09:00',
    });
    expect(Object.values(inMemoryDraftStore.documentHistories ?? {}).flat().some((version) => (
      (version.snapshot as WorkspaceDraft).body === 'Planner post'
      && version.reason === 'publish'
    ))).toBe(true);
    unmount();
  });

  it('keeps Planner text in the editor when saving it as a draft fails', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: { body: 'Previous Studio post', attachments: [], savedAt: '12:00' },
    };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    await act(async () => {
      await opener!({ text: 'Planner post', attachments: [], entities: [] });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
    vi.mocked(window.draftStorage.save).mockResolvedValueOnce({ success: false, error: 'Disk unavailable' });

    await saveEditorAsDraft();

    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toContain('Planner post');
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).not.toContain('Previous Studio post');
    // The previous Studio document is preserved as a history checkpoint, not as a temporary draft,
    // so a failed save leaves no half-written entry in the saved drafts list.
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    expect(Object.values(inMemoryDraftStore.documentHistories ?? {}).flat().some((version) => (
      (version.snapshot as WorkspaceDraft).body === 'Previous Studio post'
      && version.reason === 'before-replacement'
    ))).toBe(true);
    unmount();
  });

  it('does not delete a matching user-saved draft when restoring after Planner save', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const existingUserDraft = {
      id: 'user-saved-previous-post',
      name: 'My saved Studio post',
      body: 'Previous Studio post',
      entities: [],
      attachments: [],
      selectedChat: chatA,
      inlineButtons: [],
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none' as const,
      repeatDays: [],
      repeatOccurrences: 1,
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
    };
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [existingUserDraft],
      workspaceDraft: {
        body: 'Previous Studio post',
        attachments: [],
        savedAt: '12:00',
        selectedChat: chatA,
        date: '2026-01-10',
        time: '09:00',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 1,
      },
    };
    const registerPlannerTextOpener = vi.fn();
    const { unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    await act(async () => {
      await opener!({ text: 'Planner post', attachments: [], entities: [] });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });

    await saveEditorAsDraft();

    expect(inMemoryDraftStore.savedDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: existingUserDraft.id, body: existingUserDraft.body }),
      expect.objectContaining({ body: 'Planner post' }),
    ]));
    expect(getInMemoryWorkspaceDraft().body).toBe('Previous Studio post');
    unmount();
  });

  it.each([
    { lastAction: 'sent' as const },
    { lastAction: 'scheduled' as const },
  ])('restores the previous Studio document after Planner text is $lastAction', async ({ lastAction }) => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: { body: 'Previous Studio post', attachments: [], savedAt: '12:00' },
    };
    const registerPlannerTextOpener = vi.fn();
    const { rerender, unmount } = await renderWorkspacePage({ onRegisterPlannerTextOpener: registerPlannerTextOpener });
    const opener = registerPlannerTextOpener.mock.calls.map(([handler]) => handler)
      .find((handler) => typeof handler === 'function') as ((payload: StudioPlannerTextPayload) => Promise<boolean>) | undefined;
    await act(async () => {
      await opener!({ text: 'Planner post', attachments: [], entities: [] });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });

    await act(async () => {
      rerender({ successPulse: true, lastAction });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });

    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    expect(getInMemoryWorkspaceDraft().body).toBe('Previous Studio post');
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toContain('Previous Studio post');
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).not.toContain('Planner post');
    expect(Object.values(inMemoryDraftStore.documentHistories ?? {}).flat().some((version) => (
      (version.snapshot as WorkspaceDraft).body === 'Planner post'
      && version.reason === 'publish'
    ))).toBe(true);
    unmount();
  });

  it('persists previous versions with the workspace draft and reloads them in History', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {},
      workspaceDraft: {
        documentId: 'history-reload-document',
        body: 'Original post before reload',
        entities: [],
        attachments: [],
        selectedChat: chatA,
        inlineButtons: [],
        date: '2026-01-10',
        time: '09:00',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 1,
        savedAt: '12:00',
      },
    };
    const firstMount = await renderWorkspacePage();

    await editComposerText('Updated post after typing');
    await waitForWorkspaceAutosave();

    expect(inMemoryDraftStore.workspaceDraft).toMatchObject({ body: 'Updated post after typing' });
    expect(inMemoryDraftStore.documentHistories?.['history-reload-document']?.map((version) => (version.snapshot as WorkspaceDraft).body))
      .toEqual(['Original post before reload']);
    firstMount.unmount();

    const secondMount = await renderWorkspacePage();
    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Original post before reload');
    secondMount.unmount();
  });

  it('coalesces autosave history checkpoints while persisting every latest edit', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const documentId = 'coalesced-edit-history-document';
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {},
      workspaceDraft: {
        documentId,
        body: 'Original post before edits',
        entities: [],
        attachments: [],
        selectedChat: chatA,
        inlineButtons: [],
        date: '',
        time: '',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 1,
        savedAt: '12:00',
      },
    };
    const { unmount } = await renderWorkspacePage();

    await editComposerText('First saved edit');
    await waitForWorkspaceAutosave();
    await editComposerText('Latest saved edit');
    await waitForWorkspaceAutosave();

    expect(inMemoryDraftStore.workspaceDraft).toMatchObject({ body: 'Latest saved edit' });
    expect(inMemoryDraftStore.documentHistories?.[documentId]?.map((version) => (
      (version.snapshot as WorkspaceDraft).body
    ))).toEqual(['Original post before edits']);
    unmount();
  });

  it('keeps version history open while changing the selected document', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const previousAppearance = localStorage.getItem(EDITOR_APPEARANCE_STORAGE_KEY);
    writeEditorAppearancePreferences({
      style: 'outline',
      palette: 'custom',
      modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
    });
    const { otherDocumentId } = seedVersionHistoryDialogStore();
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('.workspace-page-version-history-dialog') as HTMLElement;
    const dialogRule = workspacePageStyles.match(/\.workspace-page-version-history-dialog\s*\{([^}]*)\}/)?.[1] ?? '';
    const documentMenuRule = workspacePageStyles.match(/\.workspace-page-version-history-document-menu\s*\{([^}]*)\}/)?.[1] ?? '';
    const documentMenuOpenRule = workspacePageStyles.match(/\.workspace-page-version-history-list\.is-document-menu-open\s*\{([^}]*)\}/)?.[1] ?? '';
    const headerRule = workspacePageStyles.match(/\.workspace-page-version-history-header\s*\{([^}]*)\}/)?.[1] ?? '';
    const dividerRule = workspacePageStyles.match(/\.workspace-page-version-history-list\s*\{([^}]*)\}/)?.[1] ?? '';
    const dialogFocusRule = workspacePageStyles.match(/\.workspace-page-version-history-dialog:focus\s*\{([^}]*)\}/)?.[1] ?? '';
    const hoverRule = workspacePageStyles.match(/\.workspace-page-version-history-dialog button:hover:not\(:disabled\),\s*\.workspace-page-version-history-dialog button:active:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] ?? '';
    const electronBackdropRule = workspacePageStyles.match(/html\.electron-runtime \.workspace-page-version-history-backdrop\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(dialog.style.getPropertyValue('--version-history-accent')).toBe('35, 157, 251');
    expect(dialog.querySelector('.workspace-page-version-history-icon svg')).not.toBeNull();
    expect(headerRule).toMatch(/justify-content:\s*center/);
    expect(dialogRule).toMatch(/border:\s*1px solid rgba\(154, 168, 184, 0\.16\)/);
    expect(dialogRule).toMatch(/height:\s*min\(700px, calc\(100dvh - 32px\)\)/);
    expect(documentMenuRule).toMatch(/max-height:\s*min\(420px, calc\(100dvh - 340px\)\)/);
    expect(documentMenuOpenRule).toMatch(/overflow:\s*hidden/);
    expect(dialogFocusRule).toMatch(/outline:\s*none/);
    expect(dividerRule).toMatch(/border-right:\s*1px solid rgba\(154, 168, 184, 0\.12\)/);
    expect(hoverRule).toMatch(/background:\s*transparent !important/);
    expect(hoverRule).toMatch(/box-shadow:\s*none !important/);
    expect(electronBackdropRule).toMatch(/backdrop-filter:\s*none/);

    await act(async () => {
      writeEditorAppearancePreferences({
        style: 'outline',
        palette: 'custom',
        modeColors: { send: '#ff6699', schedule: '#b482f5', draft: '#f58b37' },
      });
    });
    expect(dialog.style.getPropertyValue('--version-history-accent')).toBe('35, 157, 251');

    const documentPicker = dialog.querySelector('.workspace-page-version-history-document-trigger') as HTMLButtonElement;
    await act(async () => {
      documentPicker.click();
    });
    expect(documentPicker.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.querySelector('[role="listbox"]')).not.toBeNull();
    const versionList = dialog.querySelector('.workspace-page-version-history-list')!;
    expect(versionList).toHaveClass('is-document-menu-open');
    expect(versionList.querySelector('.workspace-page-version-history-item')).not.toBeNull();
    const otherDocumentOption = dialog.querySelector(`[role="option"][value="${otherDocumentId}"]`) as HTMLButtonElement;
    await act(async () => {
      otherDocumentOption.click();
    });

    expect(documentPicker.getAttribute('aria-expanded')).toBe('false');
    expect(versionList).not.toHaveClass('is-document-menu-open');
    expect(document.querySelector('.workspace-page-version-history-dialog')).not.toBeNull();
    expect(document.querySelector('.workspace-page-version-history-preview')?.textContent)
      .toContain('Other historical document');
    unmount();
    if (previousAppearance === null) localStorage.removeItem(EDITOR_APPEARANCE_STORAGE_KEY);
    else localStorage.setItem(EDITOR_APPEARANCE_STORAGE_KEY, previousAppearance);
  });

  it('opens the document picker with the keyboard and Escape closes it before the dialog', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    seedVersionHistoryDialogStore();
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('.workspace-page-version-history-dialog') as HTMLElement;
    const documentPicker = dialog.querySelector('.workspace-page-version-history-document-trigger') as HTMLButtonElement;
    await act(async () => {
      documentPicker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(documentPicker.getAttribute('aria-expanded')).toBe('true');
    const versionList = dialog.querySelector('.workspace-page-version-history-list')!;
    expect(versionList).toHaveClass('is-document-menu-open');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(documentPicker.getAttribute('aria-expanded')).toBe('false');
    expect(versionList).not.toHaveClass('is-document-menu-open');
    expect(document.querySelector('.workspace-page-version-history-dialog')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-version-history-dialog')).toBeNull();
    unmount();
  });

  it('closes version history only when the backdrop itself is clicked', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    seedVersionHistoryDialogStore();
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('.workspace-page-version-history-dialog') as HTMLElement;
    const backdrop = dialog.parentElement as HTMLElement;
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-version-history-dialog')).not.toBeNull();

    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-version-history-dialog')).toBeNull();
    unmount();
  });

  it('restores the selected version with ordered attachments and document metadata', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const oldSnapshot: WorkspaceDraft = {
      documentId: 'restore-complete-document',
      body: 'Previous Studio post',
      entities: [{ type: 'bold', offset: 0, length: 8 }],
      attachments: [
        { id: 'first', type: 'file', name: 'first.pdf', mimeType: 'application/pdf', size: 11, path: 'C:/files/first.pdf', position: 0 },
        { id: 'second', type: 'image', name: 'second.png', mimeType: 'image/png', size: 22, path: 'C:/files/second.png', position: 3 },
        { id: 'third', type: 'file', name: 'third.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 33, path: 'C:/files/third.docx', position: 5 },
      ],
      selectedChat: chatA,
      inlineButtons: [[{ id: 'history-button', label: 'Read more', action: { type: 'url', value: 'https://example.com' } }]],
      date: '2035-01-15',
      time: '18:30',
      repeatMode: 'weekly',
      repeatDays: ['monday'],
      repeatOccurrences: 4,
      savedAt: '10:00',
    };
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {
        [oldSnapshot.documentId!]: [{
          id: 'restore-version-1',
          documentId: oldSnapshot.documentId!,
          createdAt: '2026-10-01T12:00:00.000Z',
          reason: 'edit',
          snapshot: oldSnapshot as unknown as Record<string, unknown>,
        }],
      },
      workspaceDraft: {
        documentId: oldSnapshot.documentId,
        body: 'Current Studio post',
        entities: [],
        attachments: [],
        selectedChat: chatA,
        inlineButtons: [],
        date: '2026-01-10',
        time: '09:00',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 1,
        savedAt: '12:00',
      },
    };
    const setSelectedChat = vi.fn();
    const setDate = vi.fn();
    const setTime = vi.fn();
    const { rerender, unmount } = await renderWorkspacePage({ setSelectedChat, setDate, setTime });

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });
    expect(document.querySelector('.workspace-page-version-history-preview')?.textContent).toContain('Previous Studio post');
    await act(async () => {
      (document.querySelector('.workspace-page-version-history-restore') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    const restoreConfirmation = screen.getByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(restoreConfirmation).getByRole('button', { name: 'Apply' }));
    });
    rerender({ date: '2035-01-15', time: '18:30' });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    });

    const editor = document.querySelector('.workspace-page-rich-text-input.is-active');
    expect(editor?.textContent).toContain('Previous Studio post');
    expect(editor?.querySelector('strong')?.textContent).toBe('Previous');
    expect(inMemoryDraftStore.workspaceDraft).toMatchObject({
      body: 'Previous Studio post',
      documentId: oldSnapshot.documentId,
      attachments: [
        expect.objectContaining({ name: 'first.pdf', path: '/stored/first.pdf', position: 0 }),
        expect.objectContaining({ name: 'second.png', path: '/stored/second.png', position: 3 }),
        expect.objectContaining({ name: 'third.docx', path: '/stored/third.docx', position: 5 }),
      ],
      inlineButtons: oldSnapshot.inlineButtons,
      date: '2035-01-15',
      time: '18:30',
      repeatMode: 'weekly',
      repeatDays: ['monday'],
      repeatOccurrences: 4,
    });
    expect(setSelectedChat).toHaveBeenCalledWith(chatA);
    expect(setDate).toHaveBeenCalledWith('2035-01-15');
    expect(setTime).toHaveBeenCalledWith('18:30');
    expect(inMemoryDraftStore.documentHistories?.[oldSnapshot.documentId!]).toHaveLength(2);
    unmount();
  });

  it('opens a historical version as a new document without replacing either history', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const currentDocumentId = 'copy-current-document';
    const sourceDocumentId = 'copy-source-document';
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {
        [sourceDocumentId]: [{
          id: 'copy-source-version',
          documentId: sourceDocumentId,
          createdAt: '2026-10-01T12:00:00.000Z',
          reason: 'edit',
          snapshot: {
            documentId: sourceDocumentId,
            body: 'Source document copy',
            entities: [],
            attachments: [],
            selectedChat: chatA,
            inlineButtons: [],
            date: '2026-01-10',
            time: '09:00',
            repeatMode: 'none',
            repeatDays: [],
            repeatOccurrences: 1,
            savedAt: '12:00',
          },
        }],
      },
      workspaceDraft: {
        documentId: currentDocumentId,
        body: 'Current document stays available',
        attachments: [],
        savedAt: '12:00',
      },
    };
    const { unmount } = await renderWorkspacePage();
    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-version-history-copy') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    const copyConfirmation = screen.getByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(copyConfirmation).getByRole('button', { name: 'Open as copy' }));
    });
    await waitForWorkspaceAutosave();

    const copyDocumentId = getInMemoryWorkspaceDraft().documentId;
    expect(copyDocumentId).toBeTruthy();
    expect(copyDocumentId).not.toBe(sourceDocumentId);
    expect(getInMemoryWorkspaceDraft().body).toBe('Source document copy');
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toContain('Source document copy');
    expect(inMemoryDraftStore.documentHistories?.[sourceDocumentId]?.map((version) => version.id)).toEqual(['copy-source-version']);
    expect(inMemoryDraftStore.documentHistories?.[currentDocumentId]?.[0].snapshot).toMatchObject({ body: 'Current document stays available' });
    unmount();
  });

  it('leaves the current document untouched when a historical attachment is missing', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    const documentId = 'history-missing-file-document';
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {
        [documentId]: [{
          id: 'missing-file-version',
          documentId,
          createdAt: '2026-10-01T12:00:00.000Z',
          reason: 'edit',
          snapshot: {
            documentId,
            body: 'Historical post with missing file',
            entities: [],
            attachments: [{ id: 'missing', type: 'file', name: 'missing.pdf', mimeType: 'application/pdf', size: 0, path: 'C:/gone/missing.pdf', position: 0 }],
            selectedChat: chatA,
            inlineButtons: [],
            date: '2026-01-10',
            time: '09:00',
            repeatMode: 'none',
            repeatDays: [],
            repeatOccurrences: 1,
            savedAt: '12:00',
          },
        }],
      },
      workspaceDraft: { documentId, body: 'Current safe post', attachments: [], savedAt: '12:00' },
    };
    vi.mocked(window.draftStorage.copyAttachmentPath).mockResolvedValueOnce({
      success: false,
      error: 'Source file does not exist.',
    });
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-trigger') as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-version-history-restore') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    });
    const restoreConfirmation = screen.getByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(restoreConfirmation).getByRole('button', { name: 'Apply' }));
    });

    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toContain('Current safe post');
    expect(getInMemoryWorkspaceDraft().body).toBe('Current safe post');
    expect(document.querySelector('.workspace-page-version-history-error')?.textContent).toContain('missing.pdf');
    expect(inMemoryDraftStore.documentHistories?.[documentId]).toHaveLength(1);
    unmount();
  });

  it('records the current document before clearing editor text', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {},
      workspaceDraft: { documentId: 'clear-document', body: 'Text before clear', entities: [], attachments: [], savedAt: '12:00' },
    };
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-rich-text-clear') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await waitForWorkspaceAutosave();

    expect(inMemoryDraftStore.documentHistories?.['clear-document']?.map((version) => ({
      documentId: version.documentId,
      reason: version.reason,
      body: (version.snapshot as WorkspaceDraft).body,
    }))).toEqual([{ documentId: 'clear-document', reason: 'before-clear', body: 'Text before clear' }]);
    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toBe('');
    expect(inMemoryDraftStore.workspaceDraft).toBeNull();
    unmount();
  });

  it('does not clear editor text when the browser fallback cannot save a checkpoint', async () => {
    const originalDraftStorage = Object.getOwnPropertyDescriptor(window, 'draftStorage');
    const fallbackStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {},
      workspaceDraft: {
        documentId: 'fallback-clear-document',
        body: 'Keep this if local storage is full',
        entities: [],
        attachments: [],
        savedAt: '12:00',
      },
    };
    writeWorkspaceDraftStoreFallback(fallbackStore);
    Reflect.deleteProperty(window, 'draftStorage');
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'xmsgi-draft-store-fallback' || key === 'awaitmsg-draft-store-fallback') {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-rich-text-clear') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(document.querySelector('.workspace-page-rich-text-input.is-active')?.textContent).toContain('Keep this if local storage is full');
    expect(readWorkspaceDraftStoreFallback()?.workspaceDraft).toMatchObject({ body: 'Keep this if local storage is full' });

    unmount();
    setItem.mockRestore();
    if (originalDraftStorage) Object.defineProperty(window, 'draftStorage', originalDraftStorage);
  });

  it('records removed files in history without deleting the persistent copy', async () => {
    localStorage.removeItem('awaitmsg-workspace-draft');
    inMemoryDraftStore = {
      schemaVersion: 3,
      migrationVersion: 1,
      savedDrafts: [],
      documentHistories: {},
      workspaceDraft: {
        documentId: 'attachment-removal-document',
        body: 'Keep the image with this post',
        entities: [],
        attachments: [{ id: 'history-photo', type: 'image', name: 'photo.png', mimeType: 'image/png', size: 123, path: '/stored/photo.png', position: 4 }],
        savedAt: '12:00',
      },
    };
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('button[aria-label="Remove photo.png"]') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await waitForWorkspaceAutosave();

    const versions = inMemoryDraftStore.documentHistories?.['attachment-removal-document'] ?? [];
    expect(versions.map((version) => ({
      documentId: version.documentId,
      reason: version.reason,
      body: (version.snapshot as WorkspaceDraft).body,
    }))).toEqual([{ documentId: 'attachment-removal-document', reason: 'before-attachment-removal', body: 'Keep the image with this post' }]);
    expect((versions[0].snapshot as WorkspaceDraft).attachments).toMatchObject([
      { name: 'photo.png', path: '/stored/photo.png', position: 4 },
    ]);
    expect(getInMemoryWorkspaceDraft().attachments).toEqual([]);
    expect(window.draftStorage.copyAttachmentPath).toHaveBeenCalledWith('/stored/photo.png');
    unmount();
  });

  it('keeps native undo and redo shortcuts and opens History with Ctrl/Cmd+Shift+H', async () => {
    const { unmount } = await renderWorkspacePage();
    const editor = document.querySelector('[aria-label="Post content"]') as HTMLDivElement;

    const undoEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    const redoEvent = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(undoEvent);
    editor.dispatchEvent(redoEvent);
    expect(undoEvent.defaultPrevented).toBe(false);
    expect(redoEvent.defaultPrevented).toBe(false);

    const openHistoryEvent = new KeyboardEvent('keydown', { key: 'H', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => editor.dispatchEvent(openHistoryEvent));
    expect(openHistoryEvent.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      (document.querySelector('.workspace-page-version-history-close') as HTMLButtonElement).click();
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    input.remove();
    unmount();
  });

  it('restores a scheduled post in the editor without canceling it immediately', async () => {
    const registerRescheduler = vi.fn();
    const handleCancelMessage = vi.fn();
    const setSelectedChat = vi.fn();
    const setDate = vi.fn();
    const setTime = vi.fn();
    const scheduledAt = new Date('2035-01-15T18:30:00.000Z');
    const message: ScheduledMessage = {
      id: 'studio-reschedule-1',
      chatId: chatA.id,
      chatName: chatA.name,
      text: 'Restore this scheduled post',
      when: scheduledAt.toISOString(),
      createdAt: '2035-01-15T17:00:00.000Z',
      status: 'confirmed',
      attachments: ['C:\\files\\brief.pdf'],
      entities: [{ type: 'bold', offset: 0, length: 7 }],
    };
    const { rerender, unmount } = await renderWorkspacePage({
      onRegisterHistoryRescheduleHandler: registerRescheduler,
      handleCancelMessage,
      setSelectedChat,
      setDate,
      setTime,
    });
    const menuToggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    await act(async () => {
      menuToggle.click();
    });
    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => {
      scheduleOption.click();
    });
    const restoredTimeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
      .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
    await act(async () => {
      restoredTimeButton.click();
    });
    const dayInput = document.querySelector<HTMLInputElement>('[aria-label="Day"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(dayInput, '99');
      dayInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(registerRescheduler).toHaveBeenCalledWith(expect.any(Function));
    const editor = document.querySelector<HTMLDivElement>('.workspace-page-rich-text-input')!;
    Object.defineProperties(editor, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 200 },
    });
    await act(async () => {
      registerRescheduler.mock.calls[0][0](message);
    });

    const expectedDate = `${scheduledAt.getFullYear()}-${String(scheduledAt.getMonth() + 1).padStart(2, '0')}-${String(scheduledAt.getDate()).padStart(2, '0')}`;
    const expectedTime = `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
    rerender({
      date: expectedDate,
      time: expectedTime,
    });
    expect(editor.classList.contains('is-active')).toBe(true);
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });

    expect(setSelectedChat).toHaveBeenCalledWith(chatA);
    expect(setDate).toHaveBeenCalledWith(expectedDate);
    expect(setTime).toHaveBeenCalledWith(expectedTime);
    expect(handleCancelMessage).not.toHaveBeenCalled();
    expect(editor.textContent).toContain(message.text);
    expect(document.activeElement).toBe(editor);
    expect(editor.dataset.selectionStart).toBe(String(message.text.length));
    expect(editor.dataset.selectionEnd).toBe(String(message.text.length));
    expect(editor.scrollTop).toBe(700);
    const visibleTimeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
      .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
    await act(async () => {
      visibleTimeButton.click();
    });
    expect(document.querySelector<HTMLInputElement>('[aria-label="Day"]')?.value).toBe(String(scheduledAt.getDate()));
    expect(document.querySelector<HTMLInputElement>('[aria-label="Month"]')?.value).toBe(String(scheduledAt.getMonth() + 1).padStart(2, '0'));
    expect(document.querySelector<HTMLInputElement>('[aria-label="Year"]')?.value).toBe(String(scheduledAt.getFullYear()));
    expect(document.querySelector<HTMLInputElement>('[aria-label="Hours"]')?.value).toBe(expectedTime.slice(0, 2));
    expect(document.querySelector<HTMLInputElement>('[aria-label="Minutes"]')?.value).toBe(expectedTime.slice(3));

    unmount();
  });

  it('preserves all scheduled post data when draft hydration finishes after rescheduling starts', async () => {
    let finishDraftLoad!: (result: Awaited<ReturnType<typeof window.draftStorage.load>>) => void;
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: {
        body: 'An older workspace draft',
        entities: [],
        attachments: [{ name: 'old.pdf', path: 'C:\\files\\old.pdf' }],
        savedAt: '10:00',
        selectedChat: chatA,
        date: '2026-01-10',
        time: '09:00',
        repeatMode: 'none',
        repeatDays: [],
        repeatOccurrences: 5,
      },
    };
    vi.mocked(window.draftStorage.load).mockImplementationOnce(() => new Promise((resolve) => {
      finishDraftLoad = resolve;
    }));

    const registerRescheduler = vi.fn();
    const setDate = vi.fn();
    const setTime = vi.fn();
    const scheduledAt = new Date('2035-01-15T18:30:00.000Z');
    const message: ScheduledMessage = {
      id: 'studio-reschedule-before-hydration',
      chatId: chatA.id,
      chatName: chatA.name,
      text: 'Keep this exact scheduled text',
      when: scheduledAt.toISOString(),
      createdAt: '2035-01-15T17:00:00.000Z',
      status: 'confirmed',
      attachments: ['C:\\files\\brief.pdf', 'C:\\files\\photo.png'],
      entities: [{ type: 'bold', offset: 10, length: 5 }],
      replyMarkup: { inline_keyboard: [[{ text: 'Original button', url: 'https://example.com' }]] },
    };
    const { rerender, unmount } = await renderWorkspacePage({
      onRegisterHistoryRescheduleHandler: registerRescheduler,
      upcoming: [message],
      setDate,
      setTime,
    });

    try {
      await act(async () => {
        registerRescheduler.mock.calls[0][0](message);
      });
      const expectedDate = `${scheduledAt.getFullYear()}-${String(scheduledAt.getMonth() + 1).padStart(2, '0')}-${String(scheduledAt.getDate()).padStart(2, '0')}`;
      const expectedTime = `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
      rerender({ date: expectedDate, time: expectedTime });
      await act(async () => {
        finishDraftLoad({
          success: true,
          store: JSON.parse(JSON.stringify(inMemoryDraftStore)),
        });
      });

      const editor = document.querySelector('.workspace-page-rich-text-input.is-active');
      expect(editor?.textContent).toContain(message.text);
      expect(editor?.textContent).not.toContain('An older workspace draft');
      expect(document.body.textContent).toContain('brief.pdf');
      expect(document.body.textContent).toContain('photo.png');
      expect(document.querySelector('.workspace-page-rich-text-input.is-active strong')?.textContent).toBe('exact');
      expect(document.body.textContent).toContain('Original button');
      const timeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
        .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
      await act(async () => {
        timeButton.click();
      });
      expect(document.querySelector<HTMLInputElement>('[aria-label="Hours"]')?.value)
        .toBe(expectedTime.slice(0, 2));
      expect(document.querySelector<HTMLInputElement>('[aria-label="Minutes"]')?.value)
        .toBe(expectedTime.slice(3));
      expect(setDate).toHaveBeenCalledWith(expectedDate);
      expect(setDate).not.toHaveBeenCalledWith('2026-01-10');
      expect(setTime).toHaveBeenCalledWith(expectedTime);
      expect(setTime).not.toHaveBeenCalledWith('09:00');
    } finally {
      unmount();
    }
  });

  it('allows selecting publish modes before the message is ready without executing them', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: '',
      entities: [],
      attachments: [],
      savedAt: '12:00',
      date: '',
      time: '',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    const handleSchedule = vi.fn();
    const handleSendDraftNow = vi.fn().mockResolvedValue(true);
    const { unmount } = await renderWorkspacePage({
      chats: [],
      selectedChat: null,
      date: '',
      time: '',
      handleSchedule,
      handleSendDraftNow,
    });
    const menuToggle = document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement;

    for (const { menuLabel, buttonLabel } of [
      { menuLabel: 'Schedule', buttonLabel: 'Schedule' },
      { menuLabel: 'Save draft', buttonLabel: 'Save draft' },
      { menuLabel: 'Send now', buttonLabel: 'Send now' },
    ]) {
      await act(async () => {
        menuToggle.click();
      });
      const option = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
        .find((button) => button.textContent?.trim() === menuLabel) as HTMLButtonElement;

      expect(option).toBeTruthy();
      expect(option.disabled).toBe(false);

      await act(async () => {
        option.click();
      });

      const primaryLabel = document.querySelector('.workspace-page-publish-trigger-main')?.textContent?.trim();
      expect(primaryLabel).toBe(buttonLabel);
      expect((document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).disabled).toBe(false);

      if (menuLabel === 'Schedule') {
        expect(document.querySelector('.workspace-page-rich-text-schedule-stage.is-active')).toBeNull();
        const timeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
          .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
        expect(timeButton).toBeTruthy();
        await act(async () => {
          timeButton.click();
        });
        expect(document.querySelector('.workspace-page-rich-text-schedule-stage.is-active')).not.toBeNull();
      }

      if (menuLabel === 'Save draft') {
        expect(document.querySelector('.workspace-page-rich-text-schedule-stage.is-active')).toBeNull();
      }
    }

    await act(async () => {
      menuToggle.click();
    });
    const selectedSendOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Send now');
    expect(selectedSendOption?.getAttribute('aria-checked')).toBe('true');
    expect(handleSchedule).not.toHaveBeenCalled();
    expect(handleSendDraftNow).not.toHaveBeenCalled();
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    unmount();
  });

  it('closes the schedule stage after a successful schedule result', async () => {
    const handleSchedule = vi.fn();
    const setTime = vi.fn();
    const { rerender, unmount } = await renderWorkspacePage({
      date: '2035-01-15',
      time: '18:30',
      setTime,
      handleSchedule,
    });
    const menuToggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    await act(async () => menuToggle.click());
    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => scheduleOption.click());
    const timeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
      .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
    await act(async () => timeButton.click());

    const scheduleStage = '.workspace-page-rich-text-schedule-stage.is-active';
    expect(document.querySelector(scheduleStage)).not.toBeNull();
    const openTimePicker = document.querySelector<HTMLButtonElement>('[aria-label="Open time picker"]')!;
    await act(async () => openTimePicker.click());
    const availableTimes = document.querySelector('[aria-label="Available times"]')!;
    const selectedTimeOption = Array.from(availableTimes.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((option) => option.textContent?.trim() === '20:15')!;
    await act(async () => selectedTimeOption.click());
    expect(setTime).toHaveBeenCalledWith('20:15');
    rerender({ time: '20:15' });

    const doneButton = document.querySelector<HTMLButtonElement>('.workspace-page-schedule-footer .workspace-page-stage-primary')!;
    await act(async () => doneButton.click());

    expect(handleSchedule).not.toHaveBeenCalled();
    expect(document.querySelector(scheduleStage)).toBeNull();
    const publishButton = document.querySelector<HTMLButtonElement>('.workspace-page-publish-main')!;
    await act(async () => publishButton.click());

    expect(handleSchedule).toHaveBeenCalledOnce();
  expect(handleSchedule.mock.calls[0][0]).toMatchObject({ date: '2035-01-15', time: '20:15' });
    expect(document.querySelector(scheduleStage)).toBeNull();
    rerender({ scheduling: true });
    expect(document.querySelector(scheduleStage)).toBeNull();
    rerender({ scheduling: false, lastAction: 'scheduled' });
    expect(document.querySelector(scheduleStage)).toBeNull();
    unmount();
  });

  it('keeps the schedule stage open when scheduling fails', async () => {
    const handleSchedule = vi.fn();
    const { rerender, unmount } = await renderWorkspacePage({
      date: '2035-01-15',
      time: '18:30',
      handleSchedule,
    });
    const menuToggle = document.querySelector<HTMLButtonElement>('.workspace-page-publish-menu-toggle')!;
    await act(async () => menuToggle.click());
    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => scheduleOption.click());
    const timeButton = Array.from(document.querySelectorAll('.workspace-page-schedule-compact-button'))
      .find((button) => button.textContent?.trim() === 'Time') as HTMLButtonElement;
    await act(async () => timeButton.click());

    const scheduleStage = '.workspace-page-rich-text-schedule-stage.is-active';
    const publishButton = document.querySelector<HTMLButtonElement>('.workspace-page-publish-main')!;
    await act(async () => publishButton.click());
    expect(handleSchedule).toHaveBeenCalledOnce();
    rerender({ scheduling: true });
    rerender({ scheduling: false, lastAction: null });

    expect(document.querySelector(scheduleStage)).not.toBeNull();
    unmount();
  });

  it('temporarily replaces the draft color picker with a prerequisite hint', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: '',
      entities: [],
      attachments: [],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    const { unmount } = await renderWorkspacePage();
    const menuToggle = document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement;

    await act(async () => {
      menuToggle.click();
    });
    const draftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      draftOption.click();
    });

    expect(document.querySelector('.draft-color-picker')).not.toBeNull();
    vi.useFakeTimers();
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Enter a message.');
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.parentElement?.classList.contains('workspace-page-draft-footer')).toBe(true);
    expect(document.querySelector('.workspace-page-publish-footer-content')?.classList.contains('is-feedback-hidden')).toBe(true);
    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);

    const firstFeedback = document.querySelector('.workspace-page-publish-transient-feedback');
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });
    const repeatedFeedback = document.querySelector('.workspace-page-publish-transient-feedback');
    expect(repeatedFeedback?.textContent).toBe('Enter a message.');
    expect(repeatedFeedback).not.toBe(firstFeedback);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-footer-content')?.classList.contains('is-feedback-hidden')).toBe(false);
    expect(document.querySelector('.draft-color-picker')).not.toBeNull();
    vi.useRealTimers();
    unmount();
  });

  it('does not show footer hints for missing schedule time or optional repeat days', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: 'Hello world',
      entities: [],
      attachments: [],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '',
      repeatMode: 'weekly',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    const handleSchedule = vi.fn();
    const { unmount } = await renderWorkspacePage({
      date: '2026-01-10',
      time: '',
      handleSchedule,
    });
    const menuToggle = document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement;

    await act(async () => {
      menuToggle.click();
    });
    const scheduleOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Schedule') as HTMLButtonElement;
    await act(async () => {
      scheduleOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback')).toBeNull();
    expect(handleSchedule).not.toHaveBeenCalled();
    unmount();
  });

  it('renders app notifications in the footer instead of a floating toast', async () => {
    vi.useFakeTimers();
    const closeNotification = vi.fn();
    const { unmount } = await renderWorkspacePage({
      notification: {
        ...baseNotification,
        message: 'Saved to local queue.',
        title: 'Studio',
        type: 'success',
        visible: true,
      },
      closeNotification,
    });

    expect(document.querySelector('.app-notification')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toContain('Saved to local queue.');
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.classList.contains('is-success')).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3360);
    });
    expect(closeNotification).toHaveBeenCalledTimes(1);

    unmount();
    vi.useRealTimers();
  });

  it('keeps the editor preview and removes the duplicate queue UI', async () => {
    const { unmount } = await renderWorkspacePage();

    const actionGroup = document.querySelector('.workspace-page-action-left-group');
    expect(actionGroup?.querySelector('.workspace-page-mode-button-history')).toBeNull();
    expect(actionGroup?.textContent).not.toContain('Queue / History');
    expect(document.querySelector('.workspace-page-preview-panel')).not.toBeNull();
    expect(document.querySelector('.messages-panel')).toBeNull();
    const toolbar = document.querySelector('.workspace-page-rich-text-toolbar');
    expect(toolbar).not.toBeNull();
    const leadingTools = toolbar!.querySelector('.workspace-page-rich-text-leading-tools');
    expect(Array.from(leadingTools!.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Message effects',
      'Choose emoji',
    ]);
    const editorFormattingControls = Array.from(toolbar!.querySelectorAll<HTMLButtonElement>(
      '.workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-format-option, .workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-album-trigger, .workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-link-trigger:not(.workspace-page-version-history-trigger):not(.workspace-page-rich-text-album-trigger)',
    ));
    expect(editorFormattingControls.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Insert link',
      'Add photo album',
    ]);
    const toolbarActions = toolbar!.querySelector('.workspace-page-rich-text-toolbar-actions')!;
    const actionOrder = Array.from(toolbarActions.children).map((element) => {
      if (element.classList.contains('workspace-page-rich-text-toolbar-divider')) return 'divider';
      return element.getAttribute('aria-label') ?? element.querySelector('button')?.getAttribute('aria-label');
    });
    expect(actionOrder).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Insert link',
      'divider',
      'Open version history',
      'Export editor text',
      'Add photo album',
    ]);
    expect(toolbar!.querySelector('.workspace-page-rich-text-format-clear')).toBeNull();
    expect(editorFormattingControls.every((button) => !button.disabled)).toBe(true);
    expect(toolbar!.querySelector('.workspace-page-version-history-trigger')).not.toBeNull();
    expect(toolbar!.querySelector('.workspace-page-editor-export-trigger')).not.toBeNull();
    const editor = document.querySelector('.workspace-page-rich-text-input') as HTMLDivElement;
    expect(editor.getAttribute('contenteditable')).toBe('true');
    act(() => {
      editor.textContent = 'Typed immediately';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(editor.textContent).toBe('Typed immediately');
    expect(document.querySelector('.chat-preview-draft-bubble')?.textContent).toContain('Typed immediately');

    unmount();
  });

  it('shows send progress and a persistent retry action in the footer on failure', async () => {
    let resolveFirstSend: ((sent: boolean) => void) | null = null;
    const handleSendDraftNow = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        resolveFirstSend = resolve;
      }))
      .mockResolvedValueOnce(true);
    const { unmount } = await renderWorkspacePage({ handleSendDraftNow });

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Sending…');
    expect((document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveFirstSend?.(false);
      await Promise.resolve();
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not send the message.');
    expect(document.querySelector('[role="textbox"]')?.textContent).toContain('Hello world');
    const retryButton = document.querySelector('.workspace-page-publish-transient-feedback .workspace-page-send-retry') as HTMLButtonElement;
    expect(retryButton).toBeTruthy();

    vi.useFakeTimers();
    await act(async () => {
      retryButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(handleSendDraftNow).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="textbox"]')?.textContent?.trim()).toBe('');
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Message sent.');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3360);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).toBeNull();
    vi.useRealTimers();
    unmount();
  });

  it('returns failed album attachments to the editor after partial send', async () => {
    const handleSendDraftNow = vi.fn().mockImplementation(async (
      ...args: Parameters<React.ComponentProps<typeof WorkspacePage>['handleSendDraftNow']>
    ) => {
      const onAttachmentGroupResult = args[6];
      onAttachmentGroupResult?.(0, true);
      onAttachmentGroupResult?.(1, false);
      return false;
    });
    const { unmount } = await renderWorkspacePage({ handleSendDraftNow });
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]')!;
    const addAlbum = async (fileName: string) => {
      await act(async () => {
        Object.defineProperty(albumInput, 'files', {
          value: [new File(['image'], fileName, { type: 'image/png' })],
          configurable: true,
        });
        albumInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    };

    await addAlbum('sent-album.png');
    await addAlbum('failed-album.png');
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(2);

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handleSendDraftNow).toHaveBeenCalledTimes(1);
    expect(handleSendDraftNow.mock.calls[0][5]).toHaveLength(2);
    const remainingAlbumCards = Array.from(document.querySelectorAll('.workspace-page-photo-album-card'));
    expect(remainingAlbumCards).toHaveLength(1);
    expect(remainingAlbumCards[0].querySelector('img')?.getAttribute('src')).toContain('failed-album.png');
    expect(document.querySelector('.workspace-page-photo-album-card img[src*="sent-album.png"]')).toBeNull();
    expect(document.querySelector('.workspace-page-rich-text-input')?.textContent).not.toContain('Hello world');
    unmount();
  });

  it('clears send errors after their longer status period', async () => {
    const handleSendDraftNow = vi.fn().mockResolvedValue(false);
    const { unmount } = await renderWorkspacePage({ handleSendDraftNow });
    vi.useFakeTimers();

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7999);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')).toBeNull();

    vi.useRealTimers();
    unmount();
  });

  it('clears prerequisite warnings after their shorter status period', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: '',
      entities: [],
      attachments: [],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    const { unmount } = await renderWorkspacePage();
    vi.useFakeTimers();

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-warning')?.textContent).toBe('Enter a message.');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-warning')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-warning')).toBeNull();

    vi.useRealTimers();
    unmount();
  });

  it('renders the Add file attachment button', async () => {
    const { unmount } = await renderWorkspacePage();

    const attachmentButton = document.querySelector('.workspace-page-attachment-toggle') as HTMLButtonElement | null;

    expect(attachmentButton).toBeTruthy();
    expect(attachmentButton?.getAttribute('aria-label')).toBe('Add file');
    expect(attachmentButton?.querySelector('svg')).not.toBeNull();

    unmount();
  });

  it('shows send progress and success ahead of an earlier draft-store error', async () => {
    const longDraftError = `Draft storage failed. ${'UNBROKEN_ERROR_TOKEN_'.repeat(12)} Check the storage location and retry.`;
    vi.mocked(window.draftStorage.save).mockResolvedValueOnce({
      success: false,
      code: 'WRITE_FAILED',
      error: longDraftError,
    });
    let resolveSend: ((sent: boolean) => void) | null = null;
    const handleSendDraftNow = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveSend = resolve;
    }));
    const { unmount } = await renderWorkspacePage({ handleSendDraftNow });

    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      saveDraftOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const longErrorFeedback = document.querySelector('.workspace-page-publish-transient-feedback.is-error');
    expect(longErrorFeedback).toHaveTextContent(longDraftError);
    expect(longErrorFeedback?.querySelector('.workspace-page-publish-transient-feedback-status')).toHaveTextContent(longDraftError);
    expect(workspacePageStyles).toContain('overflow-wrap: anywhere;');
    expect(workspacePageStyles).toContain('max-height: min(320px, calc(100dvh - 180px));');
    expect(workspacePageStyles).toContain('overflow-y: auto;');
    expect(workspacePageStyles).not.toContain('-webkit-line-clamp: 2;');

    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const sendOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Send now') as HTMLButtonElement;
    await act(async () => {
      sendOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Sending…');

    await act(async () => {
      resolveSend?.(true);
      await Promise.resolve();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Message sent.');
    unmount();
  });

  it('keeps the Draft button after Templates and opens its stage', async () => {
    const { unmount } = await renderWorkspacePage();

    const actionGroup = document.querySelector('.workspace-page-action-left-group');
    const leftGroupButtons = Array.from(actionGroup?.querySelectorAll(':scope > button') ?? [])
      .map((button) => button.textContent?.trim());

    expect(leftGroupButtons).toContain('Draft');
    expect(leftGroupButtons).not.toContain('Queue / History');
    expect((Array.from(actionGroup?.querySelectorAll(':scope > button') ?? [])
      .find((button) => button.textContent?.trim() === 'Templates') as HTMLButtonElement).title)
      .toBe('Open and manage reusable message templates');

    const menuToggle = document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement;
    expect(menuToggle).not.toBeNull();
    expect(menuToggle.title).toBe('Choose Send now, Schedule, or Save draft');

    await act(async () => {
      menuToggle.click();
    });

    const draftMenuItem = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft');

    expect(draftMenuItem).not.toBeNull();

    await act(async () => {
      (draftMenuItem as HTMLButtonElement).click();
    });

    const draftColorPicker = document.querySelector('.workspace-page-draft-footer .draft-color-picker');
    expect(draftColorPicker).not.toBeNull();
    const greenDraftColor = draftColorPicker?.querySelector('[aria-label="Green draft color"]') as HTMLButtonElement;
    await act(async () => {
      greenDraftColor.click();
    });
    expect(draftColorPicker?.parentElement?.firstElementChild?.textContent).toBe('Green');

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });

    expect(inMemoryDraftStore.savedDrafts[0]).toMatchObject({
      body: 'Hello world',
      color: 'green',
      entities: [],
      attachments: [],
      selectedChat: { id: chatA.id, name: chatA.name },
      inlineButtons: [],
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).toBeNull();
    expect(document.querySelector('.workspace-page-draft-meta')).toBeNull();
    expect(document.body.textContent).not.toContain('Draft not saved');

    const activeActionGroup = document.querySelector('.workspace-page-action-left-group');
    const actionButtons = Array.from(activeActionGroup?.querySelectorAll(':scope > button') ?? []);
    const draftToggle = actionButtons.find((button) => button.textContent?.trim() === 'Draft');
    const templatesButtonIndex = actionButtons.findIndex((button) => button.textContent?.trim() === 'Templates');

    expect(draftToggle).not.toBeNull();
    expect(templatesButtonIndex).toBeGreaterThanOrEqual(0);
    expect(actionButtons.indexOf(draftToggle as HTMLButtonElement)).toBe(templatesButtonIndex + 1);
    expect(draftToggle?.classList.contains('workspace-page-mode-button-template')).toBe(true);
    expect(draftToggle?.classList.contains('workspace-page-mode-button-draft')).toBe(true);
    const draftHoverRule = workspacePageStyles.match(/\.workspace-page-action-left-group \.workspace-page-mode-button-template\.workspace-page-mode-button-draft:hover[^{}]*\{([^}]*)\}/)?.[1] ?? '';
    expect(draftHoverRule).toMatch(/flex:\s*0 0 auto\s*!important/);
    const modeButtonHoverRule = workspacePageStyles.match(/\.workspace-page-action-left-group \.workspace-page-mode-button-template:hover,[\s\S]*?\.workspace-page-mode-button-history\.is-active\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(modeButtonHoverRule).toMatch(/padding:\s*0 10px\s*!important/);
    expect(draftToggle?.classList.contains('is-active')).toBe(false);
    expect(draftToggle?.getAttribute('aria-pressed')).toBe('false');
    expect(draftToggle?.classList.contains('workspace-page-schedule-compact-button')).toBe(false);
    expect((draftToggle as HTMLButtonElement | undefined)?.title).toBe('Open saved drafts');

    await act(async () => {
      (draftToggle as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-rich-text-draft-stage.is-active strong')?.textContent).toBe('Saved drafts');
  expect(draftToggle?.classList.contains('is-active')).toBe(true);
  expect(draftToggle?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.workspace-page-rich-text-draft-stage .workspace-page-template-stage-item strong')?.textContent).toMatch(/^Draft /);

    unmount();
  });

  it('keeps legacy data untouched when file-store migration fails', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: 'Draft text remains available',
      entities: [],
      attachments: [],
      savedAt: '18:00',
    }));
    const legacyWorkspace = localStorage.getItem('awaitmsg-workspace-draft');
    vi.mocked(window.draftStorage.migrate).mockResolvedValueOnce({
      success: false,
      code: 'WRITE_FAILED',
      error: 'Disk unavailable',
    });

    const { unmount } = await renderWorkspacePage();

    expect(localStorage.getItem('awaitmsg-workspace-draft')).toBe(legacyWorkspace);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Disk unavailable');

    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      saveDraftOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-warning')?.textContent).toContain('Disk unavailable');
    unmount();
  });

  it('uses one backup flow to export and import all drafts', async () => {
    const { unmount } = await renderWorkspacePage();
    await openDraftsStage();
    const footer = document.querySelector('.workspace-page-draft-stage-footer');
    const exportButton = Array.from(footer?.querySelectorAll('button') ?? [])
      .find((button) => button.getAttribute('aria-label') === 'Export all drafts') as HTMLButtonElement;
    const importButton = Array.from(footer?.querySelectorAll('button') ?? [])
      .find((button) => button.getAttribute('aria-label') === 'Import drafts') as HTMLButtonElement;

    expect(exportButton).toBeTruthy();
    expect(importButton).toBeTruthy();
    expect(footer?.querySelector('[title="Export .txt"]')).toBeNull();
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    await act(async () => {
      editor.textContent = 'Latest unsaved text';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await act(async () => {
      exportButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Backup exported.');

    vi.mocked(window.draftStorage.importBackup).mockResolvedValueOnce({
      success: true,
      store: JSON.parse(JSON.stringify(inMemoryDraftStore)),
    });
    await act(async () => {
      importButton.click();
      await Promise.resolve();
    });

    expect(window.draftStorage.exportBackup).toHaveBeenCalledTimes(1);
    expect(window.draftStorage.importBackup).toHaveBeenCalledTimes(1);
    expect(getInMemoryWorkspaceDraft().body).toBe('Latest unsaved text');
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Drafts imported.');
    unmount();
  });

  it('shows a success status after a saved draft is deleted', async () => {
    const { unmount } = await renderWorkspacePage();
    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      saveDraftOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const draftModeButton = Array.from(document.querySelectorAll('.workspace-page-action-left-group > button'))
      .find((button) => button.textContent?.trim() === 'Draft') as HTMLButtonElement;
    await act(async () => {
      draftModeButton.click();
    });
    expect(document.querySelectorAll('.workspace-page-template-stage-item')).toHaveLength(1);

    const deleteButton = document.querySelector('.workspace-page-rich-text-draft-stage .workspace-page-template-stage-item > div button:last-child') as HTMLButtonElement;
    await act(async () => {
      deleteButton.click();
    });

    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Delete draft');
    await act(async () => {
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));
    });
    expect(document.querySelector('.workspace-page-template-stage-item')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Draft deleted.');
    unmount();
  });

  it('shows a success status after a template is deleted', async () => {
    localStorage.setItem('awaitmsg_domain_templates', JSON.stringify([{
      id: 'template-1',
      accountId: 'default-account',
      name: 'Welcome',
      body: 'Hello there',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    }]));
    const { unmount } = await renderWorkspacePage();
    const templatesButton = Array.from(document.querySelectorAll('.workspace-page-action-left-group > button'))
      .find((button) => button.textContent?.trim() === 'Templates') as HTMLButtonElement;
    await act(async () => {
      templatesButton.click();
    });

    const deleteButton = document.querySelector('.workspace-page-rich-text-template-stage .workspace-page-template-stage-item > div button:last-child') as HTMLButtonElement;
    await act(async () => deleteButton.click());
    const confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Delete template “Welcome”?');
    await act(async () => {
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));
    });
    expect(document.querySelector('.workspace-page-rich-text-template-stage .workspace-page-template-stage-item')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Template deleted.');
    unmount();
  });

  it('shows success statuses after creating and updating a template', async () => {
    const { unmount } = await renderWorkspacePage();
    const templatesButton = Array.from(document.querySelectorAll('.workspace-page-action-left-group > button'))
      .find((button) => button.textContent?.trim() === 'Templates') as HTMLButtonElement;
    await act(async () => {
      templatesButton.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-rich-text-template-stage .workspace-page-template-stage-footer-actions button') as HTMLButtonElement).click();
    });

    const nameInput = document.querySelector('[aria-label="Template name"]') as HTMLInputElement;
    const bodyInput = document.querySelector('#workspace-template-editor-form textarea') as HTMLTextAreaElement;
    await act(async () => {
      const nameSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const bodySetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nameSetter?.call(nameInput, 'Greeting');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      bodySetter?.call(bodyInput, 'Hello!');
      bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (document.querySelector('[form="workspace-template-editor-form"]') as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Template created.');
    const editButton = Array.from(document.querySelectorAll('.workspace-page-rich-text-template-stage .workspace-page-template-stage-item > div button'))
      .find((button) => button.textContent?.trim() === 'Edit') as HTMLButtonElement;
    await act(async () => {
      editButton.click();
    });
    const editedNameInput = document.querySelector('[aria-label="Template name"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(editedNameInput, 'Updated greeting');
      editedNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (document.querySelector('[form="workspace-template-editor-form"]') as HTMLButtonElement).click();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Template updated.');
    expect(document.querySelector('.workspace-page-rich-text-template-stage .workspace-page-template-stage-item strong')?.textContent).toContain('Updated greeting');
    unmount();
  });

  it('imports plain text into the editor without removing attached media', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: 'Old editor text',
      entities: [{ type: 'bold', offset: 0, length: 3 }],
      attachments: [{ name: 'photo.png', path: '/managed/photo.png', size: 5 }],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    vi.mocked(window.draftStorage.importText).mockResolvedValueOnce({ success: true, text: 'Imported plain text' });
    const { unmount } = await renderWorkspacePage();
    await openDraftsStage();
    const importButton = document.querySelector('.workspace-page-rich-text-draft-stage [aria-label="Import text into editor"]') as HTMLButtonElement;
    expect(importButton.textContent).toContain('Import .txt');
    expect(importButton.title).toBe('Import a .txt file into the editor');

    await act(async () => {
      importButton.click();
      await Promise.resolve();
    });
    const replaceConfirmation = screen.getByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(replaceConfirmation).getByRole('button', { name: 'Apply' }));
    });

    expect(document.querySelector('.workspace-page-rich-text-draft-stage.is-active')).toBeNull();
    expect((document.querySelector('[role="textbox"]') as HTMLDivElement).textContent).toContain('Imported plain text');
    expect(document.querySelector('.workspace-page-attachment-name')?.textContent).toBe('photo.png');
    expect(document.querySelector('.workspace-page-publish-transient-feedback')?.textContent).toBe('Text imported into the editor.');
    unmount();
  });

  it('duplicates text import failures in the shared footer status', async () => {
    vi.mocked(window.draftStorage.importText).mockResolvedValueOnce({
      success: false,
      cancelled: false,
      error: 'Text file is not valid UTF-8.',
    });
    const { unmount } = await renderWorkspacePage();
    await openDraftsStage();

    await act(async () => {
      (document.querySelector('[aria-label="Import text into editor"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(document.querySelector('.workspace-page-send-feedback[role="alert"]')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent).toContain('Text file is not valid UTF-8.');
    unmount();
  });

  async function typeEditorText(value: string) {
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    await act(async () => {
      editor.textContent = value;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
  }

  async function openExportMenu() {
    const exportTrigger = document.querySelector('.workspace-page-editor-export-trigger') as HTMLButtonElement;
    await act(async () => {
      exportTrigger.click();
    });
    return document.querySelector('.workspace-page-editor-export-menu') as HTMLDivElement;
  }

  function pickExportFormat(menu: HTMLDivElement, extension: '.txt' | '.json') {
    return Array.from(menu.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(extension)) as HTMLButtonElement;
  }

  it('keeps the toolbar visible with connected editor formatting controls', async () => {
    const { unmount } = await renderWorkspacePage();
    const toolbar = document.querySelector('.workspace-page-rich-text-toolbar');
    const editingControls = Array.from(toolbar!.querySelectorAll<HTMLButtonElement>(
      '.workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-format-option, .workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-album-trigger, .workspace-page-rich-text-toolbar-actions .workspace-page-rich-text-link-trigger:not(.workspace-page-version-history-trigger):not(.workspace-page-rich-text-album-trigger)',
    ));
    const historyTrigger = toolbar!.querySelector<HTMLButtonElement>('.workspace-page-version-history-trigger');
    const exportTrigger = toolbar!.querySelector<HTMLButtonElement>('.workspace-page-editor-export-trigger');
    const editorMeta = document.querySelector('.workspace-page-rich-text-meta-row');

    expect(toolbar).not.toBeNull();
    expect(editorMeta?.querySelector('.workspace-page-character-count')).not.toBeNull();
    expect(editorMeta?.querySelector('.workspace-page-rich-text-clear')).not.toBeNull();
    expect(toolbar!.querySelector('.workspace-page-character-count')).toBeNull();
    expect(editingControls).toHaveLength(6);
    expect(toolbar!.querySelector('.workspace-page-rich-text-format-clear')).toBeNull();
    expect(editingControls.every((button) => !button.disabled)).toBe(true);
    expect(historyTrigger).not.toBeNull();
    expect(historyTrigger?.disabled).toBe(false);
    expect(exportTrigger).not.toBeNull();
    expect(exportTrigger?.disabled).toBe(false);
    expect(document.querySelector('.workspace-page-rich-text-input')?.getAttribute('contenteditable')).toBe('true');
    unmount();
  });

  it('opens the image-only multi-select picker from the photo album toolbar button', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]');
    const click = vi.spyOn(albumInput!, 'click');

    act(() => {
      (document.querySelector('[aria-label="Add photo album"]') as HTMLButtonElement).click();
    });

    expect(albumInput).not.toBeNull();
    expect(click).toHaveBeenCalledOnce();
    unmount();
  });

  it('shows a compact album limits tooltip after a deliberate hover', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumButton = document.querySelector<HTMLButtonElement>('[aria-label="Add photo album"]')!;
    const albumInfo = document.querySelector<HTMLElement>('#workspace-page-photo-album-limits')!;
    const albumControls = albumButton.parentElement!;

    expect(albumButton.getAttribute('aria-describedby')).toBe('workspace-page-photo-album-limits');
    expect(albumInfo.getAttribute('role')).toBe('tooltip');
    expect(albumInfo.textContent).toContain('3 albums');
    expect(albumInfo.textContent).toContain('10 photos in each');
    expect(albumInfo.textContent).toContain('30 photos total');
    expect(document.querySelector('[aria-label="Photo album limits"]')).toBeNull();
    expect(workspacePageStyles).toMatch(/\.workspace-page-rich-text-toolbar\s*\{[^}]*z-index:\s*20;[^}]*transform:\s*none;/);
    expect(workspacePageStyles).toMatch(/\.workspace-page-rich-text-toolbar\.is-airy\s*\{[^}]*z-index:\s*30;/);
    expect(workspacePageStyles).toMatch(/\.workspace-page-rich-text-album-controls\.is-info-visible\s+\.workspace-page-rich-text-album-info/);

    vi.useFakeTimers();
    try {
      await act(async () => {
        albumControls.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      expect(albumControls).not.toHaveClass('is-info-visible');
      await act(async () => { await vi.advanceTimersByTimeAsync(449); });
      expect(albumControls).not.toHaveClass('is-info-visible');
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(albumControls).toHaveClass('is-info-visible');
      await act(async () => {
        albumControls.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      });
      expect(albumControls).not.toHaveClass('is-info-visible');
    } finally {
      vi.useRealTimers();
      unmount();
    }
  });

  it('adds photos to an existing album and opens its thumbnails in the attachment loupe', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]')!;
    const selectImages = async (names: string[]) => {
      await act(async () => {
        Object.defineProperty(albumInput, 'files', {
          value: names.map((name) => new File(['image'], name, { type: 'image/png' })),
          configurable: true,
        });
        albumInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    };

    await selectImages(['album-one-a.png', 'album-one-b.png']);
    const initialCard = document.querySelector('.workspace-page-photo-album-card') as HTMLElement;
    const albumId = initialCard.dataset.albumId;
    expect(initialCard).not.toHaveAttribute('title');
    expect(initialCard).toHaveAttribute('aria-label');
    expect(initialCard.querySelectorAll('.workspace-page-photo-album-preview img')).toHaveLength(2);

    await act(async () => {
      (initialCard.querySelector('.workspace-page-photo-album-add') as HTMLButtonElement).click();
    });
    await selectImages(['album-one-c.png']);

    const albumCards = document.querySelectorAll('.workspace-page-photo-album-card');
    expect(albumCards).toHaveLength(1);
    expect((albumCards[0] as HTMLElement).dataset.albumId).toBe(albumId);
    expect(albumCards[0].querySelectorAll('.workspace-page-photo-album-preview img')).toHaveLength(3);
    expect(albumCards[0].querySelector('.workspace-page-photo-album-add')).toHaveAttribute('aria-label', 'Add photos to this album');

    const previewThumbnail = albumCards[0].querySelector<HTMLImageElement>('.workspace-page-photo-album-preview img')!;
    vi.useFakeTimers();
    try {
      await act(async () => {
        previewThumbnail.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(document.querySelector('.workspace-page-attachment-preview img')?.getAttribute('src')).toContain('album-one-a.png');
    } finally {
      vi.useRealTimers();
      unmount();
    }
  });

  it('enforces the ten-photo limit when appending to an existing album', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]')!;
    const selectImages = async (names: string[]) => {
      await act(async () => {
        Object.defineProperty(albumInput, 'files', {
          value: names.map((name) => new File(['image'], name, { type: 'image/png' })),
          configurable: true,
        });
        albumInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    };

    await selectImages(Array.from({ length: 9 }, (_, index) => `album-${index}.png`));
    const albumCard = document.querySelector<HTMLElement>('.workspace-page-photo-album-card')!;
    await act(async () => {
      (albumCard.querySelector('.workspace-page-photo-album-add') as HTMLButtonElement).click();
    });
    await selectImages(['album-last.png', 'album-over-limit.png']);

    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(1);
    expect(document.querySelector('.workspace-page-photo-album-card')).toHaveTextContent('10 attachments');
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain('up to 10 photos');
    unmount();
  });

  it('adds up to three photo album cards with ten photos each and removes an album as a group', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]')!;
    const selectAlbum = async (prefix: string, count: number) => {
      const files = Array.from({ length: count }, (_, index) => new File(
        [`${prefix}-${index}`],
        `${prefix}-${index}.png`,
        { type: 'image/png' },
      ));
      await act(async () => {
        Object.defineProperty(albumInput, 'files', { value: files, configurable: true });
        albumInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    };

    await selectAlbum('first', 11);
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(1);
    expect(document.querySelector('.workspace-page-photo-album-card')).toHaveTextContent('10 attachments');
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain('up to 10 photos');

    await selectAlbum('second', 10);
    await selectAlbum('third', 10);
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(3);
    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(3);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Add photo album"]')?.disabled).toBe(true);
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(30);

    await selectAlbum('fourth', 1);
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(3);
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(30);
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain('up to 3 photo albums');

    await act(async () => {
      (document.querySelector('.workspace-page-photo-album-card .workspace-page-attachment-remove') as HTMLButtonElement).click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(2);
    unmount();
  });

  it('rejects image formats Telegram would upload as documents in a photo album', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/png"][multiple]')!;
    const gifFile = new File(['gif-image'], 'unsupported.gif', { type: 'image/gif' });

    await act(async () => {
      Object.defineProperty(albumInput, 'files', { value: [gifFile], configurable: true });
      albumInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(window.draftStorage.copyAttachment).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.workspace-page-photo-album-card')).toHaveLength(0);
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error'))
      .toHaveTextContent('Use JPG or PNG images, or WebP');
    unmount();
  });

  it('converts WebP images to PNG before adding them to a photo album', async () => {
    const { unmount } = await renderWorkspacePage();
    const albumInput = document.querySelector<HTMLInputElement>('input[accept*="image/webp"][multiple]')!;
    const imageFiles = Array.from({ length: 9 }, (_, index) => new File(
      [`png-image-${index}`],
      `photo-${index}.png`,
      { type: 'image/png' },
    ));
    const webpFile = new File(['webp-image'], 'photo.webp', { type: 'application/octet-stream' });
    const bitmap = { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap;
    const drawImage = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png-image'], { type: 'image/png' }));
    });

    try {
      await act(async () => {
        Object.defineProperty(albumInput, 'files', { value: [...imageFiles, webpFile], configurable: true });
        albumInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(window.draftStorage.copyAttachment).toHaveBeenCalledWith(expect.objectContaining({
        name: 'photo.png',
        type: 'image/png',
      }));
      expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(10);
      expect(drawImage).toHaveBeenCalledOnce();
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(document.querySelector('.workspace-page-photo-album-card')).toHaveTextContent('10 attachments');
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
      unmount();
    }
  });

  it('blocks sending a restored photo album that contains an unsupported image format', async () => {
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 1,
      savedDrafts: [],
      workspaceDraft: {
        body: 'Restored photo album',
        entities: [],
        attachments: [{
          id: 'restored-webp',
          type: 'image',
          name: 'restored.webp',
          mimeType: 'image/webp',
          size: 10,
          path: 'C:/media/restored.webp',
          position: 0,
          albumId: 'restored-album',
        }],
        savedAt: '12:00',
      },
    };
    const handleSendDraftNow = vi.fn().mockResolvedValue(true);
    const { unmount } = await renderWorkspacePage({ handleSendDraftNow });

    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(handleSendDraftNow).not.toHaveBeenCalled();
    unmount();
  });

  it('exports the current editor text as a .txt file through the format menu', async () => {
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('Hello export');

    const exportTrigger = document.querySelector('.workspace-page-editor-export-trigger') as HTMLButtonElement;
    expect(exportTrigger).toBeTruthy();
    expect(exportTrigger.getAttribute('aria-label')).toBe('Export editor text');
    const menu = await openExportMenu();
    const txtOption = pickExportFormat(menu, '.txt');
    await act(async () => {
      txtOption.click();
      await Promise.resolve();
    });

    expect(window.draftStorage.exportText).toHaveBeenCalledWith('Hello export', 'txt');
    expect(document.querySelector('.workspace-page-editor-export-menu')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Text exported to file.');
    unmount();
  });

  it('exports the current editor text as a JSON file through the format menu', async () => {
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('Structured body');

    const menu = await openExportMenu();
    const jsonOption = pickExportFormat(menu, '.json');
    await act(async () => {
      jsonOption.click();
      await Promise.resolve();
    });

    const call = vi.mocked(window.draftStorage.exportText).mock.calls[
      vi.mocked(window.draftStorage.exportText).mock.calls.length - 1
    ];
    expect(call?.[1]).toBe('json');
    expect(JSON.parse(String(call?.[0])).text).toBe('Structured body');
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')?.textContent).toBe('Text exported to file.');
    unmount();
  });

  it('blocks editor text export when there is no text and shows a warning', async () => {
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('');

    const menu = await openExportMenu();
    const txtOption = pickExportFormat(menu, '.txt');
    await act(async () => {
      txtOption.click();
      await Promise.resolve();
    });

    expect(window.draftStorage.exportText).not.toHaveBeenCalled();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-warning')?.textContent).toBe('There is no text to export.');
    unmount();
  });

  it('stays silent when the editor text export dialog is cancelled', async () => {
    vi.mocked(window.draftStorage.exportText).mockResolvedValueOnce({ success: false, cancelled: true });
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('Cancel me');

    const menu = await openExportMenu();
    const txtOption = pickExportFormat(menu, '.txt');
    await act(async () => {
      txtOption.click();
      await Promise.resolve();
    });

    expect(window.draftStorage.exportText).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.workspace-page-publish-transient-feedback')).toBeNull();
    unmount();
  });

  it('surfaces editor text export failures in the shared footer status', async () => {
    vi.mocked(window.draftStorage.exportText).mockResolvedValueOnce({ success: false, error: 'Disk is full.' });
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('Body to fail');

    const menu = await openExportMenu();
    const txtOption = pickExportFormat(menu, '.txt');
    await act(async () => {
      txtOption.click();
      await Promise.resolve();
    });

    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent).toContain('Disk is full.');
    unmount();
  });

  it('closes the editor export format menu when clicking outside', async () => {
    const { unmount } = await renderWorkspacePage();
    await typeEditorText('Outside click');

    await openExportMenu();
    expect(document.querySelector('.workspace-page-editor-export-menu')).toBeTruthy();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-editor-export-menu')).toBeNull();
    expect(window.draftStorage.exportText).not.toHaveBeenCalled();
    unmount();
  });

  it('duplicates chat lookup errors in the shared footer status', async () => {
    vi.mocked(window.telegram.findChat).mockResolvedValueOnce({ success: false, error: 'Chat not found.' });
    const { unmount } = await renderWorkspacePage();
    await act(async () => {
      (document.querySelector('.workspace-page-chat-trigger') as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-chat-stage-add') as HTMLButtonElement).click();
    });
    const queryInput = document.querySelector('.workspace-page-chat-stage-add-form input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(queryInput, '@missing');
      queryInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (document.querySelector('.workspace-page-chat-stage-add-form button') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(document.querySelector('.workspace-page-chat-stage-add-form [role="alert"]')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent).toContain('Chat not found.');
    unmount();
  });

  it('duplicates preview history errors in the shared footer with a retry action', async () => {
    vi.mocked(window.telegram.getChatHistory).mockResolvedValueOnce({ success: false, error: 'History unavailable.' });
    const { unmount } = await renderWorkspacePage({ connected: true });

    expect(window.telegram.getChatHistory).toHaveBeenCalledWith({ chatId: chatA.id, limit: 50 });
    expect(document.querySelector('.chat-preview-state.is-error')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain("The chat preview couldn't load history.");
    expect(document.querySelector('.workspace-page-publish-transient-feedback .workspace-page-send-retry')?.textContent).toBe('Retry');
    unmount();
  });

  it('does not reload preview history when the selected chat metadata changes', async () => {
    const { rerender, unmount } = await renderWorkspacePage({ connected: true });

    expect(window.telegram.getChatHistory).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ selectedChat: { ...chatA, avatarDataUrl: 'data:image/jpeg;base64,avatar' } });
      await Promise.resolve();
    });

    expect(window.telegram.getChatHistory).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('reuses a recent preview history when returning to a chat', async () => {
    const chatB: Chat = { id: 'chat-2', name: 'Beta Team', type: 'group' };
    vi.mocked(window.telegram.getChatHistory).mockResolvedValue({
      success: true,
      history: {
        chat: {
          id: chatA.id,
          title: chatA.name,
          username: chatA.username,
          type: chatA.type,
          avatarDataUrl: '',
          topic: '',
        },
        messages: [],
      },
    });
    const { rerender, unmount } = await renderWorkspacePage({ connected: true });

    expect(window.telegram.getChatHistory).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ chats: [chatA, chatB], selectedChat: chatB });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(window.telegram.getChatHistory).toHaveBeenCalledTimes(2);

    await act(async () => {
      rerender({ selectedChat: { ...chatA, avatarDataUrl: 'data:image/jpeg;base64,avatar' } });
      await Promise.resolve();
    });

    expect(window.telegram.getChatHistory).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('explains forbidden chat history without offering a retry', async () => {
    vi.mocked(window.telegram.getChatHistory).mockResolvedValueOnce({ success: false, error: 'CHAT_FORBIDDEN' });
    const { unmount } = await renderWorkspacePage({ connected: true });

    const feedback = document.querySelector('.workspace-page-publish-transient-feedback.is-error');
    expect(feedback?.textContent).toContain("You don't have access to this chat.");
    expect(feedback?.querySelector('.workspace-page-send-retry')).toBeNull();
    unmount();
  });

  it('does not expose instanceof runtime errors in preview history feedback', async () => {
    vi.mocked(window.telegram.getChatHistory).mockRejectedValueOnce(new TypeError("Right-hand side of 'instanceof' is not callable"));
    const { unmount } = await renderWorkspacePage({ connected: true });

    const feedback = document.querySelector('.workspace-page-publish-transient-feedback.is-error');
    expect(feedback?.textContent).toContain("The chat preview couldn't load history.");
    expect(feedback?.textContent).not.toContain('instanceof');
    expect(feedback?.querySelector('.workspace-page-send-retry')?.textContent).toBe('Retry');
    unmount();
  });

  it('duplicates attachment size errors in the shared footer status', async () => {
    const { unmount } = await renderWorkspacePage();
    vi.useFakeTimers();
    const oversizedFile = new File(['image'], 'large-photo.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 50 * 1024 * 1024 + 1 });
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [oversizedFile], configurable: true });

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('.workspace-page-empty-attachments')).toBeNull();
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent).toContain('large-photo.png');
    expect(window.draftStorage.copyAttachment).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3360);
    });
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')).toBeNull();
    vi.useRealTimers();
    unmount();
  });

  it('reserves the aggregate attachment limit across overlapping selections', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    const filesForBatch = (prefix: string) => Array.from({ length: 4 }, (_, index) => {
      const file = new File([''], `${prefix}-${index}.png`, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      return file;
    });
    const firstBatch = filesForBatch('first');
    const secondBatch = filesForBatch('second');
    const { unmount } = await renderWorkspacePage();
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: firstBatch, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      Object.defineProperty(fileInput, 'files', { value: secondBatch, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain('200 MB');

    await act(async () => {
      pendingCopies.forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: firstBatch[index].name, path: `/stored/${firstBatch[index].name}`, size: firstBatch[index].size },
      }));
      await Promise.resolve();
    });

    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(4);
    unmount();
  });

  it('does not attach stale files after a successful publish clears the composer', async () => {
    let resolveCopy!: (result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void;
    const copyPromise = new Promise<{ success: boolean; attachment?: { name: string; path: string; size: number } }>((resolve) => {
      resolveCopy = resolve;
    });
    vi.mocked(window.draftStorage.copyAttachment).mockReturnValue(copyPromise);
    const { rerender, unmount } = await renderWorkspacePage();
    const file = new File(['image'], 'late-photo.png', { type: 'image/png' });
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(1);

    rerender({ successPulse: true });
    resolveCopy({
      success: true,
      attachment: { name: file.name, path: `/stored/${file.name}`, size: file.size },
    });

    await act(async () => {
      await copyPromise;
      await Promise.resolve();
    });

    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(0);
    unmount();
  });

  it('releases failed file reservations while retaining reservations for copied files', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number }; error?: string }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    const makeFile = (name: string) => {
      const file = new File([''], name, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      return file;
    };
    const firstBatch = Array.from({ length: 4 }, (_, index) => makeFile(`partial-${index}.png`));
    const { unmount } = await renderWorkspacePage();
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: firstBatch, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);

    await act(async () => {
      pendingCopies.slice(0, 3).forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: firstBatch[index].name, path: `/stored/${firstBatch[index].name}`, size: firstBatch[index].size },
      }));
      pendingCopies[3]({ success: false, error: 'Simulated copy failure.' });
    });
    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(3);

    const nextFile = makeFile('after-partial-failure.png');
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [nextFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);

    await act(async () => {
      pendingCopies[4]({
        success: true,
        attachment: { name: nextFile.name, path: `/stored/${nextFile.name}`, size: nextFile.size },
      });
    });
    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(4);

    const overLimitFile = new File(['extra'], 'over-limit.png', { type: 'image/png' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [overLimitFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent)
      .toContain('200 MB');
    unmount();
  });

  it('allows a new-generation upload before old copies settle and ignores their late results', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    const makeFile = (name: string, size: number) => {
      const file = new File([''], name, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    const staleBatch = Array.from({ length: 4 }, (_, index) => makeFile(`old-${index}.png`, 50 * 1024 * 1024));
    const nextFile = makeFile('new-draft.png', 1024);
    const { rerender, unmount } = await renderWorkspacePage();
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: staleBatch, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);

    rerender({ successPulse: true });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [nextFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);

    await act(async () => {
      pendingCopies[4]({
        success: true,
        attachment: { name: nextFile.name, path: `/stored/${nextFile.name}`, size: nextFile.size },
      });
    });
    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(1);

    await act(async () => {
      pendingCopies.slice(0, 4).forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: staleBatch[index].name, path: `/stored/${staleBatch[index].name}`, size: staleBatch[index].size },
      }));
    });
    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(1);
    expect(document.querySelector('.workspace-page-attachment-name')?.textContent).toBe(nextFile.name);
    unmount();
  });

  it('does not let an old upload overwrite a selected saved draft', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    inMemoryDraftStore.savedDrafts = [{
      id: 'generation-draft',
      name: 'Transition draft',
      body: 'New draft body',
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-29T18:35:00.000Z',
      attachments: [],
    }];
    inMemoryDraftStore.migrationVersion = 1;
    const oldFiles = Array.from({ length: 4 }, (_, index) => {
      const file = new File([''], `old-draft-${index}.png`, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      return file;
    });
    const nextFile = new File(['new'], 'saved-draft-upload.png', { type: 'image/png' });
    const { unmount } = await renderWorkspacePage();
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: oldFiles, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);

    await openDraftsStage();
    const draftButton = Array.from(document.querySelectorAll('.workspace-page-rich-text-draft-stage button'))
      .find((button) => button.textContent?.includes('Transition draft')) as HTMLButtonElement;
    expect(draftButton).toBeTruthy();
    await act(async () => { draftButton.click(); });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [nextFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);

    await act(async () => {
      pendingCopies[4]({
        success: true,
        attachment: { name: nextFile.name, path: `/stored/${nextFile.name}`, size: nextFile.size },
      });
    });
    await act(async () => {
      pendingCopies.slice(0, 4).forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: oldFiles[index].name, path: `/stored/${oldFiles[index].name}`, size: oldFiles[index].size },
      }));
    });

    expect(document.querySelectorAll('.workspace-page-attachment-card')).toHaveLength(1);
    expect(document.querySelector('.workspace-page-attachment-name')?.textContent).toBe(nextFile.name);
    expect(document.querySelector('.workspace-page-rich-text-input')?.textContent).toContain('New draft body');
    unmount();
  });

  it('ignores old uploads when persisted draft restoration replaces the composer', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    let resolveLoad!: (result: Awaited<ReturnType<typeof window.draftStorage.load>>) => void;
    vi.mocked(window.draftStorage.load).mockImplementation(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const staleFiles = Array.from({ length: 4 }, (_, index) => {
      const file = new File([''], `before-restore-${index}.png`, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      return file;
    });
    const newFile = new File(['new'], 'after-restore.png', { type: 'image/png' });
    const { unmount } = await renderWorkspacePage();
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: staleFiles, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);

    resolveLoad({
      success: true,
      needsMigration: false,
      store: {
        schemaVersion: 2,
        migrationVersion: 1,
        savedDrafts: [],
        workspaceDraft: { body: 'Restored workspace draft', attachments: [] },
      },
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [newFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);

    await act(async () => {
      pendingCopies[4]({
        success: true,
        attachment: { name: newFile.name, path: `/stored/${newFile.name}`, size: newFile.size },
      });
      pendingCopies.slice(0, 4).forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: staleFiles[index].name, path: `/stored/${staleFiles[index].name}`, size: staleFiles[index].size },
      }));
    });

    expect(document.querySelector('.workspace-page-rich-text-input')?.textContent).toContain('Restored workspace draft');
    expect(Array.from(document.querySelectorAll('.workspace-page-attachment-name')).map((node) => node.textContent))
      .toEqual([newFile.name]);
    unmount();
  });

  it('keeps only the scheduled and new files when rescheduling during an old upload', async () => {
    const pendingCopies: Array<(result: { success: boolean; attachment?: { name: string; path: string; size: number } }) => void> = [];
    vi.mocked(window.draftStorage.copyAttachment).mockImplementation(() => new Promise((resolve) => {
      pendingCopies.push(resolve);
    }));
    const registerRescheduler = vi.fn();
    const staleFiles = Array.from({ length: 4 }, (_, index) => {
      const file = new File([''], `stale-${index}.png`, { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
      return file;
    });
    const newFile = new File(['new'], 'after-reschedule.png', { type: 'image/png' });
    const scheduledPost: ScheduledMessage = {
      id: 'reschedule-with-pending-upload',
      chatId: chatA.id,
      chatName: chatA.name,
      text: 'Existing scheduled post',
      when: '2035-01-15T18:30:00.000Z',
      createdAt: '2035-01-15T17:00:00.000Z',
      status: 'scheduled',
      attachments: ['C:\\scheduled\\brief.pdf'],
    };
    const { unmount } = await renderWorkspacePage({ onRegisterHistoryRescheduleHandler: registerRescheduler });
    const fileInput = document.querySelector('.workspace-page-hidden-file-input') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: staleFiles, configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(4);

    await act(async () => {
      registerRescheduler.mock.calls[0][0](scheduledPost);
    });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [newFile], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(window.draftStorage.copyAttachment).toHaveBeenCalledTimes(5);

    await act(async () => {
      pendingCopies[4]({
        success: true,
        attachment: { name: newFile.name, path: `/stored/${newFile.name}`, size: newFile.size },
      });
      pendingCopies.slice(0, 4).forEach((resolve, index) => resolve({
        success: true,
        attachment: { name: staleFiles[index].name, path: `/stored/${staleFiles[index].name}`, size: staleFiles[index].size },
      }));
    });

    expect(Array.from(document.querySelectorAll('.workspace-page-attachment-name')).map((node) => node.textContent))
      .toEqual(['brief.pdf', newFile.name]);
    unmount();
  });

  it('shows an enlarged preview when hovering or focusing an attached image', async () => {
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: 'Photo caption',
      entities: [],
      attachments: [{ name: 'photo.png', path: '/managed/photo.png', size: 5 }],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 1,
    }));
    const { unmount } = await renderWorkspacePage();
    const thumbnail = document.querySelector('.workspace-page-attachment-thumbnail') as HTMLImageElement;

    expect(thumbnail).toBeTruthy();
    expect(thumbnail.closest('.workspace-page-attachment-card')).not.toHaveAttribute('title');
    expect(thumbnail.closest('.workspace-page-attachment-card')?.querySelector('.workspace-page-attachment-name')).toHaveTextContent('photo.png');
    vi.useFakeTimers();
    await act(async () => {
      thumbnail.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector('.workspace-page-attachment-preview img')?.getAttribute('alt')).toBe('photo.png');

    await act(async () => {
      thumbnail.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).toBeNull();

    await act(async () => {
      thumbnail.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(999);
      thumbnail.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).toBeNull();

    await act(async () => {
      thumbnail.focus();
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).not.toBeNull();
    await act(async () => {
      thumbnail.blur();
    });
    expect(document.querySelector('.workspace-page-attachment-preview')).toBeNull();
    unmount();
    vi.useRealTimers();
  });

  it('does not report a named draft as saved when the file-store write fails', async () => {
    vi.mocked(window.draftStorage.save).mockResolvedValueOnce({
      success: false,
      code: 'WRITE_FAILED',
      error: 'Disk full',
    });
    const { unmount } = await renderWorkspacePage();

    await act(async () => {
      (document.querySelector('.workspace-page-publish-menu-toggle') as HTMLButtonElement).click();
    });
    const saveDraftOption = Array.from(document.querySelectorAll('.workspace-page-publish-option'))
      .find((button) => button.textContent?.trim() === 'Save draft') as HTMLButtonElement;
    await act(async () => {
      saveDraftOption.click();
    });
    await act(async () => {
      (document.querySelector('.workspace-page-publish-main') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inMemoryDraftStore.savedDrafts).toHaveLength(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Disk full');
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-error')?.textContent).toContain('Disk full');
    expect(document.querySelector('.workspace-page-publish-transient-feedback.is-success')).toBeNull();
    unmount();
  });

  it('keeps the window open when the final synchronous flush fails', async () => {
    vi.mocked(window.draftStorage.flush).mockReturnValueOnce({
      success: false,
      code: 'WRITE_FAILED',
      error: 'Flush failed',
    });
    const { unmount } = await renderWorkspacePage();
    const closeEvent = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(closeEvent, 'returnValue', { configurable: true, value: '', writable: true });

    await act(async () => {
      window.dispatchEvent(closeEvent);
      await Promise.resolve();
    });

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(String(closeEvent.returnValue)).toContain('Draft data could not be saved');
    unmount();
  });

  beforeEach(() => {
    (globalThis as typeof globalThis & { ResizeObserver?: { new (): { observe: (node: Element) => void; unobserve: (node: Element) => void; disconnect: () => void } } }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();

    document.body.innerHTML = '';
    localStorage.clear();
    localStorage.setItem('awaitmsg_locale', 'en');
    localStorage.setItem('xmsgi-default-draft-seeded-v1', '1');
    localStorage.setItem('xmsgi-default-template-seeded-v1', '1');
    localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
      body: 'Hello world',
      entities: [],
      attachments: [],
      savedAt: '12:00',
      date: '2026-01-10',
      time: '09:00',
      repeatMode: 'none',
      repeatDays: [],
      repeatOccurrences: 5,
    }));
    Object.defineProperty(window, 'telegram', {
      value: {
        findChat: vi.fn().mockResolvedValue({ success: false, error: 'Chat not found.' }),
        getChatHistory: vi.fn().mockResolvedValue({
          success: true,
          history: {
            chat: { id: chatA.id, title: chatA.name },
            messages: [],
          },
        }),
        getFilePath: vi.fn((file: File) => `/${file.name}`),
      },
      configurable: true,
    });
    inMemoryDraftStore = {
      schemaVersion: 2,
      migrationVersion: 0,
      savedDrafts: [],
      workspaceDraft: null,
    };
    Object.defineProperty(window, 'draftStorage', {
      value: {
        load: vi.fn(async () => ({
          success: true,
          store: JSON.parse(JSON.stringify(inMemoryDraftStore)),
          needsMigration: inMemoryDraftStore.migrationVersion === 0,
        })),
        migrate: vi.fn(async (legacy) => {
          inMemoryDraftStore = {
            schemaVersion: 2,
            migrationVersion: 1,
            savedDrafts: legacy.savedDrafts,
            workspaceDraft: legacy.workspaceDraft,
          };
          return { success: true, migrated: true, store: JSON.parse(JSON.stringify(inMemoryDraftStore)) };
        }),
        save: vi.fn(async (store) => {
          inMemoryDraftStore = JSON.parse(JSON.stringify(store));
          return { success: true, store: JSON.parse(JSON.stringify(inMemoryDraftStore)) };
        }),
        flush: vi.fn((store) => {
          inMemoryDraftStore = JSON.parse(JSON.stringify(store));
          return { success: true, store: JSON.parse(JSON.stringify(inMemoryDraftStore)) };
        }),
        restoreBackup: vi.fn(async () => ({ success: false, error: 'No backup' })),
        exportBackup: vi.fn(async () => ({ success: true })),
        importBackup: vi.fn(async () => ({ success: false, cancelled: true })),
        exportText: vi.fn(async () => ({ success: true })),
        importText: vi.fn(async () => ({ success: true, text: 'Imported from text file' })),
        copyAttachment: vi.fn(async (file: File) => ({
          success: true,
          attachment: { name: file.name, path: `/stored/${file.name}`, size: file.size },
        })),
          copyAttachmentPath: vi.fn(async (sourcePath: string) => {
            const name = sourcePath.split(/[\\/]/).pop() || sourcePath;
            return {
              success: true,
              attachment: { name, path: `/stored/${name}`, size: 123 },
            };
          }),
      },
      configurable: true,
    });
  });

  it('recovers the complete draft after autosave and reload', async () => {
    vi.useFakeTimers();

    try {
      localStorage.setItem('awaitmsg-workspace-draft', JSON.stringify({
        body: 'Initial draft',
        entities: [{ type: 'bold', offset: 0, length: 7 }],
        attachments: [{ name: 'photo.png', path: '/tmp/photo.png', size: 1234 }],
        savedAt: '12:00',
        date: '2026-02-14',
        time: '18:30',
        repeatMode: 'weekly',
        repeatDays: ['Sat'],
        repeatOccurrences: 3,
      }));

      const setSelectedChat = vi.fn();
      const { unmount } = await renderWorkspacePage({
        selectedChat: chatA,
        setSelectedChat,
        date: '2026-02-14',
        time: '18:30',
      });

      const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      await act(async () => {
        editor.innerHTML = '<strong>Recovered rich draft</strong>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });

      const savedDraft = getInMemoryWorkspaceDraft();
      expect(savedDraft.body).toBe('Recovered rich draft');
      expect(savedDraft.entities).toEqual([{ type: 'bold', offset: 0, length: 20 }]);
      expect(savedDraft.selectedChat).toMatchObject({ id: chatA.id, name: chatA.name });
      expect(savedDraft.attachments).toMatchObject([{ name: 'photo.png', path: '/tmp/photo.png', size: 1234 }]);
      expect(savedDraft.date).toBe('2026-02-14');
      expect(savedDraft.time).toBe('18:30');
      expect(savedDraft.repeatMode).toBe('weekly');
      expect(savedDraft.repeatDays).toEqual(['Sat']);

      unmount();

      const reloaded = await renderWorkspacePage({
        selectedChat: null,
        setSelectedChat,
        date: '',
        time: '',
      });

      expect((document.querySelector('[role="textbox"]') as HTMLDivElement).textContent).toContain('Recovered rich draft');
      expect(setSelectedChat).toHaveBeenCalledWith(expect.objectContaining({ id: chatA.id }));

      reloaded.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('autosaves the latest draft text after debounce and restores it after reload without a manual action', async () => {
    vi.useFakeTimers();

    try {
      const { unmount } = await renderWorkspacePage({
        selectedChat: null,
        date: '',
        time: '',
      });

      const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      await act(async () => {
        editor.textContent = 'Autosave draft 1';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      let savedDraft = getInMemoryWorkspaceDraft();
      expect(savedDraft.body).toBe('Hello world');

      await act(async () => {
        vi.advanceTimersByTime(400);
        await Promise.resolve();
        await Promise.resolve();
      });

      savedDraft = getInMemoryWorkspaceDraft();
      expect(savedDraft.body).toBe('Autosave draft 1');

      unmount();

      const reloaded = await renderWorkspacePage({
        selectedChat: null,
        date: '',
        time: '',
      });

      const restoredEditor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      expect(restoredEditor.textContent).toContain('Autosave draft 1');

      reloaded.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves the registered Studio leave callback only after flushing the current draft', async () => {
    let flushBeforeLeave: (() => Promise<boolean>) | null = null;
    const registerFlush = vi.fn((flush: (() => Promise<boolean>) | null) => {
      flushBeforeLeave = flush;
    });
    let resolveSave!: (result: { success: boolean; store?: PersistedDraftStore }) => void;
    vi.mocked(window.draftStorage.save).mockImplementationOnce((store) => new Promise((resolve) => {
      resolveSave = resolve;
      void store;
    }));
    const { unmount } = await renderWorkspacePage({ onRegisterBeforeLeaveStudio: registerFlush });
    const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
    await act(async () => {
      editor.textContent = 'Persist before leaving Studio';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await Promise.resolve();
    });

    expect(flushBeforeLeave).toBeTypeOf('function');
    let flushCompleted = false;
    let flushPromise!: Promise<boolean>;
    await act(async () => {
      flushPromise = flushBeforeLeave!().then((result) => {
        flushCompleted = true;
        return result;
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(window.draftStorage.save).toHaveBeenCalled());
    expect(flushCompleted).toBe(false);
    const saveCalls = vi.mocked(window.draftStorage.save).mock.calls;
    const submittedStore = saveCalls[saveCalls.length - 1]?.[0];
    expect(submittedStore?.workspaceDraft).toMatchObject({ body: 'Persist before leaving Studio' });
    inMemoryDraftStore = submittedStore!;

    await act(async () => {
      resolveSave({ success: true, store: submittedStore });
      await expect(flushPromise).resolves.toBe(true);
    });

    expect(getInMemoryWorkspaceDraft().body).toBe('Persist before leaving Studio');
    unmount();
  });

  it('flushes the latest draft on unexpected close before debounce completes', async () => {
    vi.useFakeTimers();

    try {
      const { unmount } = await renderWorkspacePage({
        selectedChat: null,
        date: '',
        time: '',
      });

      const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      await act(async () => {
        editor.textContent = 'Draft before close';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await Promise.resolve();
      });

      window.dispatchEvent(new Event('beforeunload'));

      const savedDraft = getInMemoryWorkspaceDraft();
      expect(savedDraft.body).toBe('Draft before close');

      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores the saved draft text after a reload', async () => {
    vi.useFakeTimers();

    try {
      const { unmount } = await renderWorkspacePage({
        selectedChat: null,
        date: '',
        time: '',
      });

      const editor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      await act(async () => {
        editor.textContent = 'Reloaded draft text';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });

      const savedDraft = getInMemoryWorkspaceDraft();
      expect(savedDraft.body).toContain('Reloaded draft text');

      unmount();

      const reloaded = await renderWorkspacePage({
        selectedChat: null,
        date: '',
        time: '',
      });

      const restoredEditor = document.querySelector('[role="textbox"]') as HTMLDivElement;
      expect(restoredEditor.textContent).toContain('Reloaded draft text');

      reloaded.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
