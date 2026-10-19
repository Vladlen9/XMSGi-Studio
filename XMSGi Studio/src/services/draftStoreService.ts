import { createDraftRecord, type DraftAttachment, type DraftRecord, type DraftStoreSnapshot } from '@/domain/messageDraft';

const ACTIVE_DRAFT_KEY = 'xmsgi:active-draft:v1';
const SAVED_DRAFTS_KEY = 'xmsgi:saved-drafts:v1';

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeAttachmentValues(attachments?: DraftAttachment[] | string[]): DraftAttachment[] {
  if (!Array.isArray(attachments)) return [];

  return attachments.map((attachment, index) => {
    if (typeof attachment === 'string') {
      return {
        name: attachment.split(/[\\/]/).pop() || attachment,
        path: attachment,
      } as DraftAttachment;
    }

    return {
      ...attachment,
      name: attachment.name || attachment.path || `attachment-${index}`,
      path: attachment.path || attachment.name || '',
    } satisfies DraftAttachment;
  });
}

function normalizeEntityValues(entities?: unknown[]): DraftRecord['entities'] {
  if (!Array.isArray(entities)) return [];

  return entities.filter((entity): entity is DraftRecord['entities'][number] => {
    if (!entity || typeof entity !== 'object') return false;
    const candidate = entity as Partial<DraftRecord['entities'][number]>;
    return typeof candidate.type === 'string'
      && typeof candidate.offset === 'number'
      && typeof candidate.length === 'number';
  });
}

export function readDraftStore(): DraftStoreSnapshot {
  const activeDraft = readLocalStorage<DraftRecord | null>(ACTIVE_DRAFT_KEY, null);
  const savedDrafts = readLocalStorage<DraftRecord[]>(SAVED_DRAFTS_KEY, []);

  return {
    activeDraft,
    savedDrafts: Array.isArray(savedDrafts) ? savedDrafts : [],
  };
}

export function writeDraftStore(snapshot: DraftStoreSnapshot): boolean {
  const nextSavedDrafts = Array.isArray(snapshot.savedDrafts) ? snapshot.savedDrafts : [];
  const stored = {
    activeDraft: snapshot.activeDraft ?? null,
    savedDrafts: nextSavedDrafts,
  } satisfies DraftStoreSnapshot;

  if (typeof window === 'undefined') return false;

  let previousActive: string | null;
  let previousSaved: string | null;
  let activeValue: string;
  let savedValue: string;
  try {
    previousActive = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
    previousSaved = window.localStorage.getItem(SAVED_DRAFTS_KEY);
    activeValue = JSON.stringify(stored.activeDraft);
    savedValue = JSON.stringify(stored.savedDrafts);
  } catch {
    return false;
  }

  try {
    window.localStorage.setItem(ACTIVE_DRAFT_KEY, activeValue);
    window.localStorage.setItem(SAVED_DRAFTS_KEY, savedValue);
    return true;
  } catch {
    try {
      if (previousActive === null) window.localStorage.removeItem(ACTIVE_DRAFT_KEY);
      else window.localStorage.setItem(ACTIVE_DRAFT_KEY, previousActive);
      if (previousSaved === null) window.localStorage.removeItem(SAVED_DRAFTS_KEY);
      else window.localStorage.setItem(SAVED_DRAFTS_KEY, previousSaved);
    } catch {
      return false;
    }
    return false;
  }
}

export function readActiveDraft(): DraftRecord | null {
  return readActiveDraftState().draft;
}

export function readActiveDraftState(): {
  available: boolean;
  exists: boolean;
  draft: DraftRecord | null;
} {
  if (typeof window === 'undefined') return { available: false, exists: false, draft: null };

  try {
    const raw = window.localStorage.getItem(ACTIVE_DRAFT_KEY);
    if (raw === null) return { available: true, exists: false, draft: null };
    if (raw === 'null') return { available: true, exists: true, draft: null };

    const value = JSON.parse(raw) as Partial<DraftRecord> | null;
    if (!value || typeof value !== 'object' || typeof value.message !== 'string') {
      return { available: false, exists: true, draft: null };
    }

    return { available: true, exists: true, draft: value as DraftRecord };
  } catch {
    return { available: false, exists: false, draft: null };
  }
}

export function createActiveDraftSnapshot(input: {
  message: string;
  entities?: unknown[];
  attachments?: DraftAttachment[] | string[];
  selectedChatId?: string | null;
  id?: string;
  updatedAt?: string;
}): DraftRecord {
  return createDraftRecord({
    id: input.id ?? 'shared-active-draft',
    message: input.message,
    entities: normalizeEntityValues(input.entities),
    attachments: normalizeAttachmentValues(input.attachments),
    selectedChatId: input.selectedChatId ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
}

export function writeActiveDraft(draft: DraftRecord | null): boolean {
  return writeLocalStorage(ACTIVE_DRAFT_KEY, draft);
}

export function readSavedDrafts(): DraftRecord[] {
  return readDraftStore().savedDrafts;
}

export function writeSavedDrafts(drafts: DraftRecord[]): boolean {
  const snapshot = readDraftStore();
  return writeDraftStore({
    ...snapshot,
    savedDrafts: drafts,
  });
}

export function upsertSavedDraft(draft: DraftRecord): DraftRecord[] {
  const snapshot = readDraftStore();
  const nextSavedDrafts = snapshot.savedDrafts.filter((entry) => entry.id !== draft.id);
  nextSavedDrafts.unshift(draft);
  writeDraftStore({
    ...snapshot,
    savedDrafts: nextSavedDrafts,
  });
  return nextSavedDrafts;
}

export function replaceSavedDrafts(drafts: DraftRecord[]): DraftRecord[] {
  const snapshot = readDraftStore();
  const nextDrafts = drafts.map((draft) => ({
    ...draft,
    attachments: normalizeAttachmentValues(draft.attachments),
    entities: normalizeEntityValues(draft.entities),
  }));
  writeDraftStore({
    ...snapshot,
    savedDrafts: nextDrafts,
  });
  return nextDrafts;
}
