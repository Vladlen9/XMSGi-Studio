import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readPlannerDraft,
  readPlannerDraftAttachments,
  readPlannerDraftEntities,
  readPlannerDraftUpdatedAt,
  readSavedPlannerDrafts,
  SAVED_PLANNER_DRAFT_STORAGE_KEY,
  writePlannerDraft,
  writeSavedPlannerDrafts,
} from './plannerDraft';

const plannerDraftStorageKey = 'xmsgi-planner-draft-text';
const plannerDraftUpdatedAtStorageKey = 'xmsgi-planner-draft-updated-at';
const plannerDraftEntitiesStorageKey = 'xmsgi-planner-draft-entities';
const plannerDraftAttachmentsStorageKey = 'xmsgi-planner-draft-attachments';
const plannerDraftSnapshotStorageKey = 'xmsgi-planner-draft-snapshot-v1';

describe('Planner draft persistence', () => {
  beforeEach(() => {
    window.localStorage.removeItem(plannerDraftStorageKey);
    window.localStorage.removeItem(plannerDraftUpdatedAtStorageKey);
    window.localStorage.removeItem(plannerDraftEntitiesStorageKey);
    window.localStorage.removeItem(plannerDraftAttachmentsStorageKey);
    window.localStorage.removeItem(plannerDraftSnapshotStorageKey);
    window.localStorage.removeItem(SAVED_PLANNER_DRAFT_STORAGE_KEY);
  });

  it('restores the latest text after a reload', () => {
    writePlannerDraft('Text typed into Planner');

    expect(readPlannerDraft()).toBe('Text typed into Planner');
    expect(readPlannerDraftUpdatedAt()).toEqual(expect.any(String));
  });

  it('removes the saved text when the composer is cleared', () => {
    writePlannerDraft('Text typed into Planner', [{ type: 'bold', offset: 0, length: 4 }], ['C:/files/brief.pdf']);
    writePlannerDraft('');

    expect(readPlannerDraft()).toBe('');
    expect(window.localStorage.getItem(plannerDraftStorageKey)).toBeNull();
    expect(readPlannerDraftUpdatedAt()).toBe('');
    expect(readPlannerDraftEntities()).toEqual([]);
    expect(readPlannerDraftAttachments()).toEqual([]);
  });

  it('restores text formatting and attachment paths with the draft', () => {
    const entities = [{ type: 'italic' as const, offset: 0, length: 4 }];
    const attachments = ['C:/files/brief.pdf'];
    writePlannerDraft('Note', entities, attachments);

    expect(readPlannerDraftEntities()).toEqual(entities);
    expect(readPlannerDraftAttachments()).toEqual(attachments);
  });

  it('defers the persistence burst until typing settles', () => {
    vi.useFakeTimers();

    try {
      writePlannerDraft('A');
      writePlannerDraft('AB');
      writePlannerDraft('ABC');

      expect(window.localStorage.getItem(plannerDraftSnapshotStorageKey)).toBeNull();

      vi.advanceTimersByTime(180);

      expect(readPlannerDraft()).toBe('ABC');
      expect(readPlannerDraftUpdatedAt()).toEqual(expect.any(String));
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('keeps the previous complete draft when the next atomic write fails', () => {
    vi.useFakeTimers();

    try {
      const previousEntities = [{ type: 'bold' as const, offset: 0, length: 4 }];
      const previousAttachments = ['C:/files/brief.pdf'];
      writePlannerDraft('Keep me', previousEntities, previousAttachments);
      vi.advanceTimersByTime(180);

      const originalSetItem = Storage.prototype.setItem;
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
        if (key === plannerDraftSnapshotStorageKey) throw new Error('Storage quota exceeded');
        originalSetItem.call(this, key, value);
      });

      writePlannerDraft('Partial replacement', [], []);
      vi.advanceTimersByTime(180);

      expect(readPlannerDraft()).toBe('Keep me');
      expect(readPlannerDraftEntities()).toEqual(previousEntities);
      expect(readPlannerDraftAttachments()).toEqual(previousAttachments);
      setItemSpy.mockRestore();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it('reads drafts saved by the previous multi-key format', () => {
    window.localStorage.setItem(plannerDraftStorageKey, 'Legacy note');
    window.localStorage.setItem(plannerDraftUpdatedAtStorageKey, '2026-10-01T12:00:00.000Z');
    window.localStorage.setItem(plannerDraftEntitiesStorageKey, JSON.stringify([{ type: 'italic', offset: 0, length: 6 }]));
    window.localStorage.setItem(plannerDraftAttachmentsStorageKey, JSON.stringify(['C:/files/legacy.pdf']));

    expect(readPlannerDraft()).toBe('Legacy note');
    expect(readPlannerDraftUpdatedAt()).toBe('2026-10-01T12:00:00.000Z');
    expect(readPlannerDraftEntities()).toEqual([{ type: 'italic', offset: 0, length: 6 }]);
    expect(readPlannerDraftAttachments()).toEqual(['C:/files/legacy.pdf']);
  });

  it('migrates a previously saved single draft into the queue format', () => {
    window.localStorage.setItem(SAVED_PLANNER_DRAFT_STORAGE_KEY, JSON.stringify({
      message: 'Older saved draft',
      attachments: [],
      entities: [{ type: 'bold', offset: 0, length: 5 }],
      reminderType: 'idea',
    }));

    expect(readSavedPlannerDrafts()).toEqual([{
      id: 'legacy-draft-0',
      message: 'Older saved draft',
      attachments: [],
      entities: [{ type: 'bold', offset: 0, length: 5 }],
      reminderType: 'idea',
      savedAt: '',
      pinned: false,
    }]);
  });

  it('persists and restores multiple planner drafts in queue order', () => {
    const drafts = [
      { id: 'newer', message: 'Second idea', attachments: [], entities: [], reminderType: null, savedAt: '2026-10-13T12:00:00.000Z' },
      { id: 'older', message: 'First idea', attachments: [], entities: [], reminderType: 'task' as const, savedAt: '2026-10-12T12:00:00.000Z' },
    ];

    expect(writeSavedPlannerDrafts(drafts)).toBe(true);
    expect(readSavedPlannerDrafts()).toEqual(drafts.map((draft) => ({ ...draft, pinned: false })));
  });

  it('persists whether a planner draft is pinned', () => {
    const drafts = [
      { id: 'important', message: 'Important idea', attachments: [], entities: [], reminderType: null, savedAt: '', pinned: true },
      { id: 'later', message: 'Another idea', attachments: [], entities: [], reminderType: null, savedAt: '', pinned: false },
    ];

    expect(writeSavedPlannerDrafts(drafts)).toBe(true);
    expect(readSavedPlannerDrafts()).toEqual(drafts);
  });
});