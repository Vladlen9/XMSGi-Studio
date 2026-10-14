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
const PLANNER_DRAFT_SNAPSHOT_KEY = 'xmsgi-planner-draft-snapshot-v1';
export const SAVED_PLANNER_DRAFT_STORAGE_KEY = 'xmsgi-quick-planner-saved-draft';
const PLANNER_DRAFT_WRITE_DELAY_MS = 180;
let plannerDraftWriteTimer: number | null = null;
let pendingPlannerDraftSnapshot: PlannerDraftSnapshot | null = null;

type PlannerDraftSnapshot = {
  message: string;
  updatedAt: string;
  entities: RichTextEntity[];
  attachments: string[];
};

function readPlannerDraftSnapshot(): PlannerDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(PLANNER_DRAFT_SNAPSHOT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PlannerDraftSnapshot> | null;
    if (!value || typeof value.message !== 'string') return null;
    return {
      message: value.message,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
      entities: Array.isArray(value.entities) ? value.entities : [],
      attachments: Array.isArray(value.attachments)
        ? value.attachments.filter((path): path is string => typeof path === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function clearLegacyPlannerDraft() {
  for (const key of [PLANNER_DRAFT_STORAGE_KEY, PLANNER_DRAFT_UPDATED_AT_KEY, PLANNER_DRAFT_ENTITIES_KEY, PLANNER_DRAFT_ATTACHMENTS_KEY]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      return;
    }
  }
}

export function readPlannerDraft() {
  const pendingSnapshot = pendingPlannerDraftSnapshot;
  if (pendingSnapshot) return pendingSnapshot.message;

  const snapshot = readPlannerDraftSnapshot();
  if (snapshot) return snapshot.message;

  try {
    return window.localStorage.getItem(PLANNER_DRAFT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function readPlannerDraftEntities(): RichTextEntity[] {
  const pendingSnapshot = pendingPlannerDraftSnapshot;
  if (pendingSnapshot) return normalizeRichTextEntities(pendingSnapshot.entities, pendingSnapshot.message.length);

  const snapshot = readPlannerDraftSnapshot();
  if (snapshot) return normalizeRichTextEntities(snapshot.entities, snapshot.message.length);

  try {
    const value = JSON.parse(window.localStorage.getItem(PLANNER_DRAFT_ENTITIES_KEY) || '[]');
    return normalizeRichTextEntities(value, readPlannerDraft().length);
  } catch {
    return [];
  }
}

export function readPlannerDraftAttachments(): string[] {
  const pendingSnapshot = pendingPlannerDraftSnapshot;
  if (pendingSnapshot) return pendingSnapshot.attachments;

  const snapshot = readPlannerDraftSnapshot();
  if (snapshot) return snapshot.attachments;

  try {
    const value = JSON.parse(window.localStorage.getItem(PLANNER_DRAFT_ATTACHMENTS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

export function writePlannerDraft(message: string, entities: RichTextEntity[] = [], attachments: string[] = []) {
  const snapshot = {
    message,
    updatedAt: message || attachments.length ? new Date().toISOString() : '',
    entities,
    attachments,
  } satisfies PlannerDraftSnapshot;

  pendingPlannerDraftSnapshot = snapshot;

  if (plannerDraftWriteTimer !== null) {
    window.clearTimeout(plannerDraftWriteTimer);
  }

  plannerDraftWriteTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(PLANNER_DRAFT_SNAPSHOT_KEY, JSON.stringify(snapshot));
      clearLegacyPlannerDraft();
      pendingPlannerDraftSnapshot = null;
    } catch {
      pendingPlannerDraftSnapshot = null;
      // Keep Planner usable when local storage is unavailable.
    } finally {
      plannerDraftWriteTimer = null;
    }
  }, PLANNER_DRAFT_WRITE_DELAY_MS);
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
  const snapshot = readPlannerDraftSnapshot();
  if (snapshot) return snapshot.updatedAt;

  try {
    return window.localStorage.getItem(PLANNER_DRAFT_UPDATED_AT_KEY) ?? '';
  } catch {
    return '';
  }
}