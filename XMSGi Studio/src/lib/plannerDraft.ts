import { normalizeRichTextEntities } from './richText';
import type { RichTextEntity } from '@/types';

const PLANNER_DRAFT_STORAGE_KEY = 'xmsgi-planner-draft-text';
const PLANNER_DRAFT_UPDATED_AT_KEY = 'xmsgi-planner-draft-updated-at';
const PLANNER_DRAFT_ENTITIES_KEY = 'xmsgi-planner-draft-entities';
const PLANNER_DRAFT_ATTACHMENTS_KEY = 'xmsgi-planner-draft-attachments';

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

export function readPlannerDraftUpdatedAt() {
  try {
    return window.localStorage.getItem(PLANNER_DRAFT_UPDATED_AT_KEY) ?? '';
  } catch {
    return '';
  }
}