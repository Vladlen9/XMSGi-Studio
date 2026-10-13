import { beforeEach, describe, expect, it } from 'vitest';
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

describe('Planner draft persistence', () => {
  beforeEach(() => {
    window.localStorage.removeItem(plannerDraftStorageKey);
    window.localStorage.removeItem(plannerDraftUpdatedAtStorageKey);
    window.localStorage.removeItem(plannerDraftEntitiesStorageKey);
    window.localStorage.removeItem(plannerDraftAttachmentsStorageKey);
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