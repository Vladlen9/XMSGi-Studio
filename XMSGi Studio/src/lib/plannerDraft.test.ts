import { beforeEach, describe, expect, it } from 'vitest';
import {
  readPlannerDraft,
  readPlannerDraftAttachments,
  readPlannerDraftEntities,
  readPlannerDraftUpdatedAt,
  writePlannerDraft,
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
});