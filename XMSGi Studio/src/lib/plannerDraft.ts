import { normalizeRichTextEntities } from './richText';
import type { RichTextEntity } from '@/types';
import { load, save } from './storage';
import type { PlannerReminderType, SavedPlannerDraft as SavedPlannerDraftModel } from '@/workspace/historyModel';

export type SavedPlannerDraft = SavedPlannerDraftModel;
export const SAVED_PLANNER_DRAFTS_UPDATED_EVENT = 'xmsgi-saved-planner-drafts-updated';

const PLANNER_DRAFT_STORAGE_KEY = 'xmsgi-planner-draft-text';
const PLANNER_DRAFT_UPDATED_AT_KEY = 'xmsgi-planner-draft-updated-at';
const PLANNER_DRAFT_ENTITIES_KEY = 'xmsgi-planner-draft-entities';
const PLANNER_DRAFT_ATTACHMENTS_KEY = 'xmsgi-planner-draft-attachments';
export const SAVED_PLANNER_DRAFT_STORAGE_KEY = 'xmsgi-quick-planner-saved-draft';

export function readPlannerDraft() {
  try {
    return window.localStorage.getItem(PLANNER_DRAFT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function readPlannerDraftEntities(): RichTextEntity[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLANNER_DRAFT_ENTITIES_KEY) || '[]');
    return normalizeRichTextEntities(value, readPlannerDraft().length);
  } catch {
    return [];
  }
}

export function readPlannerDraftAttachments(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLANNER_DRAFT_ATTACHMENTS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

export function writePlannerDraft(message: string, entities: RichTextEntity[] = [], attachments: string[] = []) {
  try {
    if (message || attachments.length) {
      window.localStorage.setItem(PLANNER_DRAFT_STORAGE_KEY, message);
      window.localStorage.setItem(PLANNER_DRAFT_UPDATED_AT_KEY, new Date().toISOString());
      if (entities.length) window.localStorage.setItem(PLANNER_DRAFT_ENTITIES_KEY, JSON.stringify(entities));
      else window.localStorage.removeItem(PLANNER_DRAFT_ENTITIES_KEY);
      if (attachments.length) window.localStorage.setItem(PLANNER_DRAFT_ATTACHMENTS_KEY, JSON.stringify(attachments));
      else window.localStorage.removeItem(PLANNER_DRAFT_ATTACHMENTS_KEY);
    } else {
      window.localStorage.removeItem(PLANNER_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(PLANNER_DRAFT_UPDATED_AT_KEY);
      window.localStorage.removeItem(PLANNER_DRAFT_ENTITIES_KEY);
      window.localStorage.removeItem(PLANNER_DRAFT_ATTACHMENTS_KEY);
    }
  } catch {
    // Keep Planner usable when local storage is unavailable.
  }
}

export function readSavedPlannerDraft(): SavedPlannerDraft | null {
  const stored = load<unknown>(SAVED_PLANNER_DRAFT_STORAGE_KEY, null);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;

  const value = stored as Partial<SavedPlannerDraft>;
  if (typeof value.message !== 'string' || !Array.isArray(value.attachments)) return null;
  const reminderTypes: PlannerReminderType[] = ['task', 'meeting', 'reminder', 'event', 'idea'];

  return {
    id: typeof value.id === 'string' ? value.id : 'legacy-draft',
    message: value.message,
    attachments: value.attachments.filter((attachment): attachment is string => typeof attachment === 'string'),
    entities: normalizeRichTextEntities(value.entities, value.message.length),
    reminderType: reminderTypes.includes(value.reminderType as PlannerReminderType)
      ? value.reminderType as PlannerReminderType
      : null,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    pinned: value.pinned === true,
  };
}

export function readSavedPlannerDrafts(): SavedPlannerDraft[] {
  const stored = load<unknown>(SAVED_PLANNER_DRAFT_STORAGE_KEY, null);
  const values = Array.isArray(stored) ? stored : stored ? [stored] : [];
  const reminderTypes: PlannerReminderType[] = ['task', 'meeting', 'reminder', 'event', 'idea'];

  return values.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const value = item as Partial<SavedPlannerDraft>;
    if (typeof value.message !== 'string' || !Array.isArray(value.attachments)) return [];

    return [{
      id: typeof value.id === 'string' && value.id
        ? value.id
        : `legacy-draft-${index}`,
      message: value.message,
      attachments: value.attachments.filter((attachment): attachment is string => typeof attachment === 'string'),
      entities: normalizeRichTextEntities(value.entities, value.message.length),
      reminderType: reminderTypes.includes(value.reminderType as PlannerReminderType)
        ? value.reminderType as PlannerReminderType
        : null,
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
      pinned: value.pinned === true,
    }];
  });
}

export function writeSavedPlannerDraft(draft: SavedPlannerDraft) {
  const wasSaved = save(SAVED_PLANNER_DRAFT_STORAGE_KEY, draft);
  if (wasSaved && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_PLANNER_DRAFTS_UPDATED_EVENT));
  }
  return wasSaved;
}

export function writeSavedPlannerDrafts(drafts: SavedPlannerDraft[]) {
  const wasSaved = save(SAVED_PLANNER_DRAFT_STORAGE_KEY, drafts);
  if (wasSaved && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SAVED_PLANNER_DRAFTS_UPDATED_EVENT));
  }
  return wasSaved;
}

export function readPlannerDraftUpdatedAt() {
  try {
    return window.localStorage.getItem(PLANNER_DRAFT_UPDATED_AT_KEY) ?? '';
  } catch {
    return '';
  }
}