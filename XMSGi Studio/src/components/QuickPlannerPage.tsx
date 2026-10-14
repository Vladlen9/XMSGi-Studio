import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  FileText,
  History,
  Lightbulb,
  Paperclip,
  Pin,
  Plus,
  Send,
  Settings,
  Smile,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { Chat, ChatPermissions, NotificationState, NotificationType, RichTextEntity, ScheduledMessage } from '@/types';
import type { HistoryItem } from '@/workspace/historyModel';
import type { StudioPlannerTextPayload } from '@shared/bridge';
import {
  EDITOR_APPEARANCE_UPDATED_EVENT,
  getEditorAppearanceCssTokens,
  readEditorAppearancePreferences,
} from '@shared/editorAppearance';
import { insertMessageText, limitMessageText } from '@/lib/messageLimits';
import { readSavedPlannerDrafts, SAVED_PLANNER_DRAFTS_UPDATED_EVENT, writeSavedPlannerDrafts, type SavedPlannerDraft } from '@/lib/plannerDraft';
import { mergeRichTextEntities } from '@/lib/richText';
import { useLocale } from '@/lib/i18n';
import { load, save } from '@/lib/storage';
import { ChatPicker } from '@/components/ChatPicker';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';
import './QuickPlannerPage.css';

type QuickPlannerMode = 'send' | 'schedule' | 'draft';
type ReminderType = 'task' | 'meeting' | 'reminder' | 'event' | 'idea';

const plannerModes = (t: ReturnType<typeof useLocale>['t']) => [
  { id: 'send' as const, label: t('quickplanner.mode.send'), icon: Send },
  { id: 'schedule' as const, label: t('quickplanner.mode.schedule'), icon: CalendarDays },
  { id: 'draft' as const, label: t('quickplanner.mode.draft'), icon: FileText },
];

const scheduleQuickOptions = [
  { group: 'now', label: 'Сейчас', ariaLabel: 'Сейчас', minutes: 0 },
  { group: 'time', label: '+30 мин', ariaLabel: 'Через 30 минут', minutes: 30 },
  { group: 'time', label: '+1 ч', ariaLabel: 'Через 1 час', minutes: 60 },
  { group: 'days', label: '+1 день', ariaLabel: 'Через 1 день', days: 1 },
  { group: 'days', label: '+1 неделя', ariaLabel: 'Через 1 неделю', days: 7 },
];

const scheduleTimeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

function formatScheduleDateValue(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatScheduleDateLabel(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
}

function maskScheduleDateDigits(digits: string) {
  let masked = digits.slice(0, 2);
  if (digits.length > 2) masked += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) masked += `.${digits.slice(4, 8)}`;
  return masked;
}

function maskScheduleTimeDigits(digits: string) {
  let masked = digits.slice(0, 2);
  if (digits.length > 2) masked += `:${digits.slice(2, 4)}`;
  return masked;
}

function isValidScheduleDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day;
}

function parseScheduleDateInput(text: string): string | null {
  const trimmed = text.trim();
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const localMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const digits = trimmed.replace(/\D/g, '');
  let year = '';
  let month = '';
  let day = '';
  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else if (localMatch) {
    [, day, month, year] = localMatch;
  } else if (digits.length === 8) {
    day = digits.slice(0, 2);
    month = digits.slice(2, 4);
    year = digits.slice(4, 8);
  } else {
    return null;
  }
  const candidate = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isValidScheduleDateValue(candidate) ? candidate : null;
}

function parseScheduleTimeInput(text: string): string | null {
  const trimmed = text.trim();
  const separatedMatch = trimmed.match(/^(\d{1,2})[:.](\d{1,2})$/);
  const digits = trimmed.replace(/\D/g, '');
  let hours = '';
  let minutes = '';
  if (separatedMatch) {
    [, hours, minutes] = separatedMatch;
  } else if (digits.length === 4) {
    hours = digits.slice(0, 2);
    minutes = digits.slice(2, 4);
  } else {
    return null;
  }
  if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) return null;
  const hoursNumber = Number(hours);
  const minutesNumber = Number(minutes);
  if (hoursNumber > 23 || minutesNumber > 59) return null;
  return `${String(hoursNumber).padStart(2, '0')}:${String(minutesNumber).padStart(2, '0')}`;
}

type PlannerPreviewMessage = {
  id: string;
  time: string;
  chat: string;
  message: string;
  pinned?: boolean;
};

type PlannerPreviewGroup = {
  label: string;
  items: PlannerPreviewMessage[];
};

type PlannerPreviewScrollPositions = Record<'history' | 'queue', number>;
type PersistedPlannerPreviewState = {
  publishMode?: QuickPlannerMode;
  historyMockGroups?: unknown;
  queuePreviewGroups?: unknown;
  pinnedHistoryIds?: unknown;
  hiddenHistoryIds?: unknown;
  scrollPositions?: unknown;
  expandedPreviewMessageId?: unknown;
};

const PLANNER_PREVIEW_STORAGE_KEY = 'xmsgi-quick-planner-preview-state';

function readPlannerPreviewState(): PersistedPlannerPreviewState {
  const stored = load<unknown>(PLANNER_PREVIEW_STORAGE_KEY, null);
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored as PersistedPlannerPreviewState
    : {};
}

function clonePreviewGroups(groups: PlannerPreviewGroup[]): PlannerPreviewGroup[] {
  return groups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }));
}

function restorePreviewGroups(value: unknown, fallback: PlannerPreviewGroup[]): PlannerPreviewGroup[] {
  if (!Array.isArray(value)) return clonePreviewGroups(fallback);
  return value.flatMap((group): PlannerPreviewGroup[] => {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return [];
    const storedGroup = group as { label?: unknown; items?: unknown };
    if (typeof storedGroup.label !== 'string' || !Array.isArray(storedGroup.items)) return [];
    const items = storedGroup.items.filter((item): item is PlannerPreviewMessage => (
      Boolean(item && typeof item === 'object' && !Array.isArray(item)
        && typeof item.id === 'string'
        && typeof item.time === 'string'
        && typeof item.chat === 'string'
        && typeof item.message === 'string')
    ));
    return [{ label: storedGroup.label, items: items.map((item) => ({ ...item, pinned: Boolean(item.pinned) })) }];
  });
}

function restorePreviewIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function restorePreviewScrollPositions(value: unknown): PlannerPreviewScrollPositions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { history: 0, queue: 0 };
  const positions = value as Partial<PlannerPreviewScrollPositions>;
  return {
    history: typeof positions.history === 'number' && Number.isFinite(positions.history) ? Math.max(0, positions.history) : 0,
    queue: typeof positions.queue === 'number' && Number.isFinite(positions.queue) ? Math.max(0, positions.queue) : 0,
  };
}

const historyPreviewData: PlannerPreviewGroup[] = [
  {
    label: 'Today',
    items: [
      { id: 'history-release-notes', time: '14:32', chat: 'Saved Messages', message: 'Release notes are ready for review.' },
      { id: 'history-launch-checklist', time: '12:08', chat: 'Product team', message: 'The launch checklist is in good shape.' },
      { id: 'history-customer-outline', time: '09:46', chat: 'Customer notes', message: 'Sent the updated outline to review.' },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      { id: 'history-updated-mockup', time: '18:41', chat: 'Design review', message: 'Updated mockup is ready.' },
      { id: 'history-next-week', time: '10:15', chat: 'Saved Messages', message: "Ideas for next week's update." },
      { id: 'history-sprint-notes', time: '08:20', chat: 'Product team', message: 'The sprint notes are ready.' },
    ],
  },
  {
    label: 'Earlier',
    items: [
      { id: 'history-release-plan', time: '16:54', chat: 'Product team', message: 'Release plan approved.' },
      { id: 'history-design-review', time: '13:27', chat: 'Design review', message: 'Shared the first screen concepts.' },
      { id: 'history-customer-follow-up', time: '09:12', chat: 'Customer notes', message: 'Follow-up sent after the demo.' },
    ],
  },
];

const queuePreviewData: PlannerPreviewGroup[] = [
  {
    label: 'Today',
    items: [
      { id: 'queue-release-notes', time: '16:30', chat: 'Saved Messages', message: 'Share the release notes.' },
      { id: 'queue-launch-checklist', time: '19:00', chat: 'Product team', message: "Reminder: review tomorrow's checklist." },
      { id: 'queue-weekly-summary', time: '20:30', chat: 'Saved Messages', message: 'Prepare the weekly summary.' },
    ],
  },
  {
    label: 'Tomorrow',
    items: [
      { id: 'queue-morning-update', time: '09:15', chat: 'Product team', message: 'Morning status update.' },
      { id: 'queue-final-screens', time: '14:00', chat: 'Design review', message: 'Review the final screens.' },
      { id: 'queue-open-questions', time: '16:20', chat: 'Product team', message: 'Follow up on open questions.' },
    ],
  },
  {
    label: 'Later',
    items: [
      { id: 'queue-roadmap-review', time: '10:00', chat: 'Product team', message: 'Review the next roadmap draft.' },
      { id: 'queue-customer-recap', time: '13:45', chat: 'Customer notes', message: 'Send the meeting recap.' },
      { id: 'queue-design-handoff', time: '17:10', chat: 'Design review', message: 'Share the final handoff.' },
    ],
  },
];

function buildHistoryPreviewGroups(records: HistoryItem[], pinnedIds: string[], hiddenIds: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const groups: Record<'Today' | 'Yesterday' | 'Earlier', PlannerPreviewMessage[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  const sentRecords = records
    .filter((record) => record.status === 'sent' && !hiddenIds.includes(record.id))
    .sort((left, right) => {
      const leftDate = new Date(left.sentAt ?? left.updatedAt ?? left.scheduledAt ?? '').getTime();
      const rightDate = new Date(right.sentAt ?? right.updatedAt ?? right.scheduledAt ?? '').getTime();
      return (Number.isNaN(rightDate) ? 0 : rightDate) - (Number.isNaN(leftDate) ? 0 : leftDate);
    });

  sentRecords.forEach((record) => {
    const sentAt = record.sentAt ?? record.updatedAt ?? record.scheduledAt ?? '';
    const date = new Date(sentAt);
    const validDate = !Number.isNaN(date.getTime());
    const dateKey = validDate ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : -1;
    const label = dateKey === today.getTime()
      ? 'Today'
      : dateKey === yesterday.getTime()
        ? 'Yesterday'
        : 'Earlier';
    groups[label].push({
      id: record.id,
      time: validDate ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : '--:--',
      chat: record.channelName || record.title || 'Unknown chat',
      message: record.text.trim() || (record.attachments.length > 0 ? 'Attachment sent' : 'Message sent'),
      pinned: pinnedIds.includes(record.id),
    });
  });

  return (['Today', 'Yesterday', 'Earlier'] as const)
    .map((label) => ({ label, items: groups[label] }))
    .filter(({ items }) => items.length > 0);
}

const reminderTypeIds: ReminderType[] = ['task', 'meeting', 'reminder', 'event', 'idea'];

function getReminderTypeOptions(t: ReturnType<typeof useLocale>['t']) {
  return [
    { id: 'task' as const, label: t('quickplanner.reminderType.task'), icon: CheckCircle2 },
    { id: 'meeting' as const, label: t('quickplanner.reminderType.meeting'), icon: Clock },
    { id: 'reminder' as const, label: t('quickplanner.reminderType.reminder'), icon: Bell },
    { id: 'event' as const, label: t('quickplanner.reminderType.event'), icon: CalendarDays },
    { id: 'idea' as const, label: t('quickplanner.reminderType.idea'), icon: Lightbulb },
  ];
}

function sortPlannerDraftsByPinned(drafts: SavedPlannerDraft[]) {
  return [
    ...drafts.filter((draft) => draft.pinned),
    ...drafts.filter((draft) => !draft.pinned),
  ];
}

const plannerMotivations = {
  en: [
    'Keep growing, keep glowing.',
    'Be patient with your progress.',
    'Make your ordinary extraordinary.',
    'Focus on what matters.',
    'Choose what moves you forward.',
  ],
  ru: [
    'Двигайся вперёд, не останавливаясь.',
    'Будь терпелив с собственным прогрессом.',
    'Сделай обычное особенным.',
    'Фокусируйся на главном.',
    'Выбирай то, что ведёт тебя вперёд.',
  ],
} as const;

let lastPlannerMotivation: string | null = null;

function choosePlannerMotivation(locale: 'en' | 'ru') {
  const choices = plannerMotivations[locale].filter((phrase) => phrase !== lastPlannerMotivation);
  return choices[Math.floor(Math.random() * choices.length)] ?? plannerMotivations[locale][0];
}

function readSavedReminderType(): ReminderType | null {
  const savedType = load<unknown>(REMINDER_TYPE_STORAGE_KEY, null);
  return reminderTypeIds.includes(savedType as ReminderType) ? savedType as ReminderType : null;
}

const plannerEmojis = ['😀', '😂', '😥', '😍', '😎', '🤔', '😭', '👋', '👍', '🙏', '🔥', '❤️', '✨', '🎉', '✅', '🚀', '☕', '🌸'];
const MAX_PLANNER_ATTACHMENTS = 7;
const MAX_VISIBLE_ATTACHMENT_CHIPS = 5;
const MAX_PLANNER_TEXT = 1023;
const MAX_COMPOSE_RESIZE = 40;
const COMPOSE_RESIZE_STORAGE_KEY = 'xmsgi-quick-planner-compose-height';
const REMINDER_TYPE_STORAGE_KEY = 'xmsgi-quick-planner-reminder-type';
function clampComposeResize(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, value));
}

function areAttachmentsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((attachment, index) => attachment === right[index]);
}

function areEntitiesEqual(left: RichTextEntity[], right: RichTextEntity[]) {
  return left.length === right.length && left.every((entity, index) => {
    const other = right[index];
    return entity.type === other.type
      && entity.offset === other.offset
      && entity.length === other.length
      && entity.url === other.url;
  });
}

function readSavedComposeHeight() {
  const value = load<unknown>(COMPOSE_RESIZE_STORAGE_KEY, 0);
  return typeof value === 'number' && Number.isFinite(value)
    ? clampComposeResize(value, MAX_COMPOSE_RESIZE)
    : 0;
}

type QuickPlannerPageProps = {
  draftOnlyMode?: boolean;
  chats: Chat[];
  selectedChat: Chat | null;
  selectedChatPermissions: ChatPermissions | null;
  onSelectChat: (chat: Chat | null) => void;
  onAddChat: (chat: Chat) => void;
  onRemoveChat: (chat: Chat) => void;
  onChatPickerError?: (message: string, title: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
  entities: RichTextEntity[];
  onEntitiesChange: (entities: RichTextEntity[]) => void;
  attachments: string[];
  onAttachmentsChange: (attachments: string[]) => void;
  upcoming: ScheduledMessage[];
  sentHistory?: HistoryItem[];
  isSending: boolean;
  isScheduling: boolean;
  onSendNow: (message: string, attachments: string[], entities: RichTextEntity[]) => Promise<boolean>;
  onSchedule: (payload: { chatId: string; message: string; date: string; time: string; attachments: string[]; entities: RichTextEntity[] }) => Promise<void>;
  onSaveDraft: (message: string, attachments: string[], entities: RichTextEntity[], reminderType: ReminderType | null) => void;
  onOpenInStudio: (payload: StudioPlannerTextPayload) => void;
  notification?: NotificationState;
  closeNotification?: () => void;
};

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatToday(value: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(value);
}

function formatCurrentTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(value);
}

function updateEntitiesForTextChange(entities: RichTextEntity[], previousText: string, nextText: string) {
  let prefix = 0;
  while (prefix < previousText.length && prefix < nextText.length && previousText[prefix] === nextText[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < previousText.length - prefix
    && suffix < nextText.length - prefix
    && previousText[previousText.length - suffix - 1] === nextText[nextText.length - suffix - 1]
  ) suffix += 1;

  const oldEditEnd = previousText.length - suffix;
  const newEditEnd = nextText.length - suffix;
  const offsetDelta = newEditEnd - oldEditEnd;

  return mergeRichTextEntities(entities.flatMap((entity) => {
    const entityEnd = entity.offset + entity.length;
    if (entityEnd <= prefix) return [entity];
    if (entity.offset >= oldEditEnd) return [{ ...entity, offset: entity.offset + offsetDelta }];

    const preserved: RichTextEntity[] = [];
    if (entity.offset < prefix) {
      preserved.push({ ...entity, length: prefix - entity.offset });
    }
    if (entityEnd > oldEditEnd) {
      preserved.push({ ...entity, offset: newEditEnd, length: entityEnd - oldEditEnd });
    }
    return preserved;
  }));
}

export function QuickPlannerPage({
  draftOnlyMode = false,
  chats,
  selectedChat,
  selectedChatPermissions,
  onSelectChat,
  onAddChat,
  onRemoveChat,
  onChatPickerError,
  message,
  onMessageChange,
  entities,
  onEntitiesChange,
  attachments,
  onAttachmentsChange,
  upcoming,
  sentHistory,
  isSending,
  isScheduling,
  onSendNow,
  onSchedule,
  onSaveDraft,
  onOpenInStudio,
  notification,
  closeNotification,
}: QuickPlannerPageProps) {
  const { locale, t } = useLocale();
  const reminderTypes = useMemo(() => getReminderTypeOptions(t), [t]);
  const plannerModeOptions = useMemo(() => {
    const modes = plannerModes(t);
    return draftOnlyMode ? modes.filter(({ id }) => id === 'draft') : modes;
  }, [draftOnlyMode, t]);
  const { currentSection, openStudio, openPosts, openSettings } = useContext(QuickPlannerNavigationContext);
  const [previewPersistence] = useState(readPlannerPreviewState);
  const [sidebarMotivation] = useState(() => choosePlannerMotivation(locale));
  const [editorAppearance, setEditorAppearance] = useState(readEditorAppearancePreferences);
  const [publishMode, setPublishMode] = useState<QuickPlannerMode>(() => (
    draftOnlyMode
      ? 'draft'
      : plannerModeOptions.some(({ id }) => id === previewPersistence.publishMode)
      ? previewPersistence.publishMode as QuickPlannerMode
      : 'send'
  ));
  const [reminderType, setReminderType] = useState<ReminderType | null>(readSavedReminderType);
  const [savedPlannerDrafts, setSavedPlannerDrafts] = useState<SavedPlannerDraft[]>(readSavedPlannerDrafts);
  const [historyMockGroups, setHistoryMockGroups] = useState<PlannerPreviewGroup[]>(() => restorePreviewGroups(previewPersistence.historyMockGroups, historyPreviewData));
  const [queuePreviewGroups, setQueuePreviewGroups] = useState<PlannerPreviewGroup[]>(() => restorePreviewGroups(previewPersistence.queuePreviewGroups, queuePreviewData));
  const [pinnedHistoryIds, setPinnedHistoryIds] = useState<string[]>(() => restorePreviewIds(previewPersistence.pinnedHistoryIds));
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<string[]>(() => restorePreviewIds(previewPersistence.hiddenHistoryIds));
  const [previewScrollPositions, setPreviewScrollPositions] = useState<PlannerPreviewScrollPositions>(() => restorePreviewScrollPositions(previewPersistence.scrollPositions));
  const [expandedPreviewMessageId, setExpandedPreviewMessageId] = useState<string | null>(() => (
    typeof previewPersistence.expandedPreviewMessageId === 'string' ? previewPersistence.expandedPreviewMessageId : null
  ));
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [showDraftSelectionHint, setShowDraftSelectionHint] = useState(false);
  const draftSelectionHintTimeoutRef = useRef<number | null>(null);
  const [isReminderTypePanelOpen, setIsReminderTypePanelOpen] = useState(false);
  const [composeResize, setComposeResize] = useState(() => ({ height: readSavedComposeHeight() }));
  const [isResizingCompose, setIsResizingCompose] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [plannerEditorBaseHeight, setPlannerEditorBaseHeight] = useState<number | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => {
    const defaultDate = new Date();
    defaultDate.setMinutes(defaultDate.getMinutes() + 1);
    return toLocalDateTimeValue(defaultDate);
  });

  useEffect(() => {
    const refreshEditorAppearance = () => setEditorAppearance(readEditorAppearancePreferences());
    window.addEventListener(EDITOR_APPEARANCE_UPDATED_EVENT, refreshEditorAppearance);
    window.addEventListener('storage', refreshEditorAppearance);
    return () => {
      window.removeEventListener(EDITOR_APPEARANCE_UPDATED_EVENT, refreshEditorAppearance);
      window.removeEventListener('storage', refreshEditorAppearance);
    };
  }, []);

  useEffect(() => {
    const syncSavedPlannerDrafts = () => {
      const nextDrafts = readSavedPlannerDrafts();
      const availableDraftIds = new Set(nextDrafts.map(({ id }) => id));
      setSavedPlannerDrafts(nextDrafts);
      setSelectedDraftIds((current) => current.filter((id) => availableDraftIds.has(id)));
    };
    window.addEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, syncSavedPlannerDrafts);
    return () => window.removeEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, syncSavedPlannerDrafts);
  }, []);

  useEffect(() => {
    save(PLANNER_PREVIEW_STORAGE_KEY, {
      publishMode,
      historyMockGroups,
      queuePreviewGroups,
      pinnedHistoryIds,
      hiddenHistoryIds,
      scrollPositions: previewScrollPositions,
      expandedPreviewMessageId,
    });
  }, [expandedPreviewMessageId, hiddenHistoryIds, historyMockGroups, pinnedHistoryIds, previewScrollPositions, publishMode, queuePreviewGroups]);

  useEffect(() => {
    if (!expandedPreviewMessageId) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedPreviewMessageId(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedPreviewMessageId]);
  const [scheduleDate, scheduleTime] = scheduleDateTime.split('T');
  const quickPlannerAccent = getEditorAppearanceCssTokens(editorAppearance, publishMode)['--editor-outline'];
  const minimumScheduleDate = new Date(currentTime);
  minimumScheduleDate.setMinutes(minimumScheduleDate.getMinutes() + 1, 0, 0);
  const minimumScheduleDateTime = toLocalDateTimeValue(minimumScheduleDate);
  const isScheduleDateTimeValid = Boolean(
    scheduleDate
    && scheduleTime
    && new Date(scheduleDateTime).getTime() > Date.now(),
  );
  const setScheduleDateTimeWithinRange = (date: string, time: string) => {
    const nextDateTime = `${date}T${time}`;
    setScheduleDateTime(date && time && nextDateTime < minimumScheduleDateTime
      ? minimumScheduleDateTime
      : nextDateTime);
  };
  const [scheduleDateDraft, setScheduleDateDraft] = useState<string | null>(null);
  const [scheduleTimeDraft, setScheduleTimeDraft] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [schedulePickerPosition, setSchedulePickerPosition] = useState({ top: 8, left: 8 });
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const scheduleDatePillRef = useRef<HTMLLabelElement | null>(null);
  const scheduleTimePillRef = useRef<HTMLLabelElement | null>(null);
  const scheduleDatePickerRef = useRef<HTMLDivElement | null>(null);
  const scheduleTimePickerRef = useRef<HTMLDivElement | null>(null);
  const minimumScheduleDateValue = minimumScheduleDateTime.slice(0, 10);
  const minimumScheduleTimeValue = minimumScheduleDateTime.slice(11, 16);
  const todayScheduleDateValue = formatScheduleDateValue(new Date());

  const toggleScheduleDatePicker = () => {
    setTimePickerOpen(false);
    setScheduleDateDraft(null);
    if (!datePickerOpen) {
      setCalendarCursor(isValidScheduleDateValue(scheduleDate)
        ? new Date(`${scheduleDate}T12:00:00`)
        : new Date());
    }
    setDatePickerOpen((open) => !open);
  };
  const toggleScheduleTimePicker = () => {
    setDatePickerOpen(false);
    setScheduleTimeDraft(null);
    setTimePickerOpen((open) => !open);
  };
  const closeSchedulePickers = () => {
    setDatePickerOpen(false);
    setTimePickerOpen(false);
  };

  useEffect(() => {
    if (!datePickerOpen && !timePickerOpen) return undefined;

    const updateSchedulePickerPosition = () => {
      const anchor = datePickerOpen ? scheduleDatePillRef.current : scheduleTimePillRef.current;
      if (!anchor) return;
      const bounds = anchor.getBoundingClientRect();
      const width = datePickerOpen ? 246 : 172;
      const height = datePickerOpen ? 276 : 272;
      const topBelow = bounds.bottom + 6;
      const top = topBelow + height + 8 > window.innerHeight
        ? Math.max(8, bounds.top - height - 6)
        : topBelow;
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      setSchedulePickerPosition({ top, left });
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (datePickerOpen) {
        if (
          !scheduleDatePickerRef.current?.contains(target)
          && !scheduleDatePillRef.current?.contains(target)
        ) {
          setDatePickerOpen(false);
        }
      } else if (timePickerOpen) {
        if (
          !scheduleTimePickerRef.current?.contains(target)
          && !scheduleTimePillRef.current?.contains(target)
        ) {
          setTimePickerOpen(false);
        }
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeSchedulePickers();
    };

    updateSchedulePickerPosition();
    window.addEventListener('resize', updateSchedulePickerPosition);
    window.addEventListener('scroll', updateSchedulePickerPosition, true);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updateSchedulePickerPosition);
      window.removeEventListener('scroll', updateSchedulePickerPosition, true);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [datePickerOpen, timePickerOpen]);

  useEffect(() => {
    if (!timePickerOpen) return;
    const selectedOption = scheduleTimePickerRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selectedOption?.scrollIntoView?.({ block: 'center' });
  }, [timePickerOpen]);

  useEffect(() => {
    setDatePickerOpen(false);
    setTimePickerOpen(false);
    setScheduleDateDraft(null);
    setScheduleTimeDraft(null);
  }, [publishMode]);

  const handleScheduleDateChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 8);
    if (digits.length === 8) {
      const parsed = parseScheduleDateInput(digits);
      if (parsed) {
        setScheduleDateDraft(null);
        setScheduleDateTimeWithinRange(parsed, scheduleTime || '12:00');
        return;
      }
    }
    setScheduleDateDraft(maskScheduleDateDigits(digits));
  };
  const handleScheduleDateBlur = () => {
    if (scheduleDateDraft === null) return;
    const parsed = parseScheduleDateInput(scheduleDateDraft);
    if (parsed) setScheduleDateTimeWithinRange(parsed, scheduleTime || '12:00');
    setScheduleDateDraft(null);
  };
  const handleScheduleDatePaste = (event: ReactClipboardEvent<HTMLInputElement>) => {
    const parsed = parseScheduleDateInput(event.clipboardData.getData('text'));
    if (!parsed) return;
    event.preventDefault();
    setScheduleDateDraft(null);
    setScheduleDateTimeWithinRange(parsed, scheduleTime || '12:00');
  };
  const handleScheduleTimeChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 4);
    if (digits.length === 4) {
      const parsed = parseScheduleTimeInput(digits);
      if (parsed) {
        setScheduleTimeDraft(null);
        setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateValue, parsed);
        return;
      }
    }
    setScheduleTimeDraft(maskScheduleTimeDigits(digits));
  };
  const handleScheduleTimeBlur = () => {
    if (scheduleTimeDraft === null) return;
    const parsed = parseScheduleTimeInput(scheduleTimeDraft);
    if (parsed) setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateValue, parsed);
    setScheduleTimeDraft(null);
  };
  const handleScheduleTimePaste = (event: ReactClipboardEvent<HTMLInputElement>) => {
    const parsed = parseScheduleTimeInput(event.clipboardData.getData('text'));
    if (!parsed) return;
    event.preventDefault();
    setScheduleTimeDraft(null);
    setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateValue, parsed);
  };
  const [sendingNow, setSendingNow] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<'sent' | 'scheduled' | 'saved' | 'failed' | null>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const [blockedWarning, setBlockedWarning] = useState<string | null>(null);
  const blockedWarningTimeoutRef = useRef<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [permissionWarningPulse, setPermissionWarningPulse] = useState(false);
  const [draftScrollbar, setDraftScrollbar] = useState({ height: 0, offset: 0, scrollable: false });
  const [previewScrollbar, setPreviewScrollbar] = useState({ height: 0, offset: 0, scrollable: false });
  const plannerEditorRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftListRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftScrollbarRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftScrollDragRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
  const plannerPreviewListRef = useRef<HTMLDivElement | null>(null);
  const plannerPreviewScrollbarRef = useRef<HTMLDivElement | null>(null);
  const plannerPreviewScrollDragRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
  const composeResizeHeightRef = useRef(composeResize.height);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionRef = useRef({ start: message.length, end: message.length });
  const previousMessageRef = useRef(message);
  const pendingScheduleRef = useRef<{
    chatId: string;
    message: string;
    timestamp: number;
    attachments: string[];
    entities: RichTextEntity[];
    reminderType: ReminderType | null;
    previousIds: Set<string>;
  } | null>(null);
  const composeResizeStartRef = useRef<{
    pointerId: number;
    y: number;
    height: number;
  } | null>(null);
  const selectedReminderType = reminderTypes.find(({ id }) => id === reminderType);
  const SelectedReminderTypeIcon = selectedReminderType?.icon;
  const updateReminderType = (nextType: ReminderType | null) => {
    setReminderType(nextType);
    save(REMINDER_TYPE_STORAGE_KEY, nextType);
  };
  const hideDraftSelectionHint = () => {
    if (draftSelectionHintTimeoutRef.current !== null) {
      window.clearTimeout(draftSelectionHintTimeoutRef.current);
      draftSelectionHintTimeoutRef.current = null;
    }
    setShowDraftSelectionHint(false);
  };

  const showDraftSelectionHintForMoment = () => {
    if (draftSelectionHintTimeoutRef.current !== null) {
      window.clearTimeout(draftSelectionHintTimeoutRef.current);
    }
    setShowDraftSelectionHint(true);
    draftSelectionHintTimeoutRef.current = window.setTimeout(() => {
      setShowDraftSelectionHint(false);
      draftSelectionHintTimeoutRef.current = null;
    }, 3000);
  };

  const updateDraftScrollbar = useCallback(() => {
    const list = plannerDraftListRef.current;
    const track = plannerDraftScrollbarRef.current;
    if (!list || !track) return;

    const trackHeight = track.clientHeight;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const scrollable = trackHeight > 0 && maxScroll > 1;
    const height = scrollable
      ? Math.min(trackHeight, Math.max(28, trackHeight * list.clientHeight / list.scrollHeight))
      : trackHeight;
    const offset = scrollable
      ? (list.scrollTop / maxScroll) * (trackHeight - height)
      : 0;

    setDraftScrollbar((current) => (
      current.height === height && current.offset === offset && current.scrollable === scrollable
        ? current
        : { height, offset, scrollable }
    ));
  }, []);

  const handleDraftScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const list = plannerDraftListRef.current;
    const track = plannerDraftScrollbarRef.current;
    if (event.button !== 0 || !list || !track) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    plannerDraftScrollDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: list.scrollTop,
    };
  };

  const handleDraftScrollbarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = plannerDraftScrollDragRef.current;
    const list = plannerDraftListRef.current;
    const track = plannerDraftScrollbarRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !list || !track) return;

    const maxScroll = list.scrollHeight - list.clientHeight;
    const thumbTravel = track.clientHeight - draftScrollbar.height;
    if (maxScroll <= 0 || thumbTravel <= 0) return;
    list.scrollTop = drag.startScrollTop + ((event.clientY - drag.startY) / thumbTravel) * maxScroll;
    updateDraftScrollbar();
  };

  const finishDraftScrollbarDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (plannerDraftScrollDragRef.current?.pointerId === event.pointerId) {
      plannerDraftScrollDragRef.current = null;
    }
  };

  const handleDraftScrollbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = plannerDraftListRef.current;
    if (!list) return;
    const pageSize = list.clientHeight * 0.85;
    switch (event.key) {
      case 'ArrowUp':
        list.scrollTop -= 40;
        break;
      case 'ArrowDown':
        list.scrollTop += 40;
        break;
      case 'PageUp':
        list.scrollTop -= pageSize;
        break;
      case 'PageDown':
        list.scrollTop += pageSize;
        break;
      case 'Home':
        list.scrollTop = 0;
        break;
      case 'End':
        list.scrollTop = list.scrollHeight;
        break;
      default:
        return;
    }
    event.preventDefault();
    updateDraftScrollbar();
  };

  const updatePreviewScrollbar = useCallback(() => {
    const list = plannerPreviewListRef.current;
    const track = plannerPreviewScrollbarRef.current;
    if (!list || !track) return;

    const trackHeight = track.clientHeight;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const scrollable = trackHeight > 0 && maxScroll > 1;
    const height = scrollable
      ? Math.min(trackHeight, Math.max(28, trackHeight * list.clientHeight / list.scrollHeight))
      : trackHeight;
    const offset = scrollable
      ? (list.scrollTop / maxScroll) * (trackHeight - height)
      : 0;

    setPreviewScrollbar((current) => (
      current.height === height && current.offset === offset && current.scrollable === scrollable
        ? current
        : { height, offset, scrollable }
    ));
  }, []);

  const handlePreviewScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const list = plannerPreviewListRef.current;
    const track = plannerPreviewScrollbarRef.current;
    if (event.button !== 0 || !list || !track) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    plannerPreviewScrollDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: list.scrollTop,
    };
  };

  const handlePreviewScrollbarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = plannerPreviewScrollDragRef.current;
    const list = plannerPreviewListRef.current;
    const track = plannerPreviewScrollbarRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !list || !track) return;

    const maxScroll = list.scrollHeight - list.clientHeight;
    const thumbTravel = track.clientHeight - previewScrollbar.height;
    if (maxScroll <= 0 || thumbTravel <= 0) return;
    list.scrollTop = drag.startScrollTop + ((event.clientY - drag.startY) / thumbTravel) * maxScroll;
    updatePreviewScrollbar();
  };

  const finishPreviewScrollbarDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (plannerPreviewScrollDragRef.current?.pointerId === event.pointerId) {
      plannerPreviewScrollDragRef.current = null;
    }
  };

  const handlePreviewScrollbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = plannerPreviewListRef.current;
    if (!list) return;
    const pageSize = list.clientHeight * 0.85;
    switch (event.key) {
      case 'ArrowUp':
        list.scrollTop -= 40;
        break;
      case 'ArrowDown':
        list.scrollTop += 40;
        break;
      case 'PageUp':
        list.scrollTop -= pageSize;
        break;
      case 'PageDown':
        list.scrollTop += pageSize;
        break;
      case 'Home':
        list.scrollTop = 0;
        break;
      case 'End':
        list.scrollTop = list.scrollHeight;
        break;
      default:
        return;
    }
    event.preventDefault();
    updatePreviewScrollbar();
  };

  useEffect(() => {
    updateDraftScrollbar();
    const list = plannerDraftListRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateDraftScrollbar);
    observer.observe(list);
    list.querySelectorAll('.quick-planner-draft').forEach((draft) => observer.observe(draft));
    window.addEventListener('resize', updateDraftScrollbar);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDraftScrollbar);
    };
  }, [savedPlannerDrafts, updateDraftScrollbar]);

  useEffect(() => {
    lastPlannerMotivation = sidebarMotivation;
  }, [sidebarMotivation]);

  const currentDraftRef = useRef({ message, attachments, entities, reminderType, selectedChatId: selectedChat?.id });
  currentDraftRef.current = { message, attachments, entities, reminderType, selectedChatId: selectedChat?.id };
  const isPermissionBlocked = (publishMode === 'send' && selectedChatPermissions?.canSend === false)
    || (publishMode === 'schedule' && selectedChatPermissions?.canSchedule === false);
  const permissionWarningText = isPermissionBlocked ? 'Нет доступа' : undefined;
  const hasPlannerNotification = Boolean(notification?.visible && notification.message);
  const actionInFlight = isSending || isScheduling || sendingNow;
  const getBlockedActionReason = (): string | null => {
    if (isPermissionBlocked) return 'This chat does not allow this action.';
    if (publishMode !== 'draft' && !selectedChat) return 'Choose a chat to send to.';
    if (!message.trim() && attachments.length === 0) {
      return publishMode === 'draft'
        ? 'Add text or an attachment to save a draft.'
        : 'Add text or an attachment to send.';
    }
    if (publishMode === 'schedule' && !isScheduleDateTimeValid) return 'Choose a future date and time.';
    return null;
  };
  const actionButtonLabel = actionFeedback === 'sent'
    ? 'Message sent'
    : actionFeedback === 'scheduled'
      ? 'Scheduled'
      : actionFeedback === 'failed'
        ? 'Action failed'
        : null;
  const actionButtonSucceeded = Boolean(actionFeedback && actionFeedback !== 'failed');
  const progressStatus = isSending || isScheduling || sendingNow
    ? { message: publishMode === 'schedule' ? 'Scheduling message…' : 'Sending message…', type: 'info' as const }
    : null;
  const actionFeedbackStatus = actionFeedback === 'sent'
    ? { message: 'Message sent.', type: 'success' as const }
    : actionFeedback === 'scheduled'
      ? { message: 'Message scheduled.', type: 'success' as const }
      : actionFeedback === 'failed'
        ? { message: 'The action failed. Review the error and try again.', type: 'error' as const }
        : null;
  const blockedWarningStatus = blockedWarning
    ? { message: blockedWarning, type: 'warning' as const }
    : null;
  const currentPlannerStatus: { message: string; type: NotificationType } | null = hasPlannerNotification
    ? { message: notification!.message, type: notification!.type }
    : blockedWarningStatus ?? actionFeedbackStatus ?? progressStatus;
  const hasVisiblePlannerStatus = Boolean(currentPlannerStatus?.message);
  const isShortPlannerNotification = (currentPlannerStatus?.message.length ?? 0) <= 70;
  const isMassWarningNotification = currentPlannerStatus?.type === 'warning' && (currentPlannerStatus.message.length ?? 0) > 80;

  const showActionFeedback = useCallback((feedback: 'sent' | 'scheduled' | 'saved' | 'failed') => {
    if (actionFeedbackTimeoutRef.current !== null) window.clearTimeout(actionFeedbackTimeoutRef.current);
    setActionFeedback(feedback);
    actionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setActionFeedback(null);
      actionFeedbackTimeoutRef.current = null;
    }, 1500);
  }, []);

  const showBlockedWarning = (message: string) => {
    if (blockedWarningTimeoutRef.current !== null) window.clearTimeout(blockedWarningTimeoutRef.current);
    setBlockedWarning(message);
    blockedWarningTimeoutRef.current = window.setTimeout(() => {
      setBlockedWarning(null);
      blockedWarningTimeoutRef.current = null;
    }, 2600);
  };

  const capturePlannerEditorHeight = () => {
    const height = plannerEditorRef.current?.getBoundingClientRect().height;
    if (height) setPlannerEditorBaseHeight(height);
  };

  useLayoutEffect(() => {
    if (composeResize.height <= 0 || !plannerEditorRef.current) return;
    const editorHeight = plannerEditorRef.current.getBoundingClientRect().height;
    if (!editorHeight) return;
    setPlannerEditorBaseHeight(window.innerWidth <= 700 ? editorHeight - composeResize.height : editorHeight);
  }, [composeResize.height]);

  const handleComposeResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    capturePlannerEditorHeight();
    composeResizeStartRef.current = {
      pointerId: event.pointerId,
      y: event.clientY,
      height: composeResize.height,
    };
    setIsResizingCompose(true);
  };

  const handleComposeResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = composeResizeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const height = clampComposeResize(start.height - (event.clientY - start.y) * 2, MAX_COMPOSE_RESIZE);
    composeResizeHeightRef.current = height;
    setComposeResize({ height });
  };

  const finishComposeResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (composeResizeStartRef.current?.pointerId !== event.pointerId) return;
    composeResizeStartRef.current = null;
    setIsResizingCompose(false);
    save(COMPOSE_RESIZE_STORAGE_KEY, composeResizeHeightRef.current);
  };

  const handleComposeResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const resizeStep = event.shiftKey ? 2 : 10;
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (composeResize.height === 0) capturePlannerEditorHeight();
    const height = clampComposeResize(composeResize.height + (event.key === 'ArrowUp' ? resizeStep : -resizeStep), MAX_COMPOSE_RESIZE);
    composeResizeHeightRef.current = height;
    setComposeResize({ height });
    save(COMPOSE_RESIZE_STORAGE_KEY, height);
  };

  const plannerEditorResizeStyle = composeResize.height > 0 && plannerEditorBaseHeight !== null
    ? { height: `${plannerEditorBaseHeight}px` } as CSSProperties
    : undefined;

  const composeResizeStyle = {
    '--quick-planner-resize-height': `${composeResize.height}px`,
    '--quick-planner-resize-half-height': `${composeResize.height / 2}px`,
  } as CSSProperties;

  const runPlannerAction = async () => {
    setActionFeedback(null);
    setBlockedWarning(null);
    if (actionInFlight) return;
    if (publishMode === 'schedule') {
      const scheduleTimestamp = new Date(scheduleDateTime).getTime();
      if (!Number.isFinite(scheduleTimestamp) || scheduleTimestamp <= Date.now()) {
        const nextAvailableDate = new Date();
        nextAvailableDate.setMinutes(nextAvailableDate.getMinutes() + 1, 0, 0);
        setScheduleDateTime(toLocalDateTimeValue(nextAvailableDate));
        showBlockedWarning('Choose a future date and time.');
        return;
      }
    }
    const blockedReason = getBlockedActionReason();
    if (blockedReason) {
      showBlockedWarning(blockedReason);
      return;
    }
    if (publishMode === 'draft') {
      const draftToSave: SavedPlannerDraft = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message,
        attachments: [...attachments],
        entities: entities.map((entity) => ({ ...entity })),
        reminderType,
        savedAt: new Date().toISOString(),
      };
      const nextDrafts = sortPlannerDraftsByPinned([draftToSave, ...readSavedPlannerDrafts()]);
      if (!writeSavedPlannerDrafts(nextDrafts)) {
        showActionFeedback('failed');
        return;
      }

      try {
        onSaveDraft(message, attachments, entities, reminderType);
        setSavedPlannerDrafts(nextDrafts);
        setShowDraftSelectionHint(false);
        onMessageChange('');
        onEntitiesChange([]);
        onAttachmentsChange([]);
        updateReminderType(null);
        showActionFeedback('saved');
      } catch {
        showActionFeedback('failed');
      }
      return;
    }
    if (!selectedChat) return;

    if (publishMode === 'schedule') {
      const [date, time] = scheduleDateTime.split('T');
      if (!date || !time) return;
      pendingScheduleRef.current = {
        chatId: selectedChat.id,
        message,
        timestamp: new Date(`${date}T${time}`).getTime(),
        attachments: [...attachments],
        entities: entities.map((entity) => ({ ...entity })),
        reminderType,
        previousIds: new Set(upcoming.map((item) => item.id)),
      };
      try {
        await onSchedule({ chatId: selectedChat.id, message, date, time, attachments, entities });
      } catch {
        pendingScheduleRef.current = null;
        showActionFeedback('failed');
      }
      return;
    }

    const submittedDraft = {
      chatId: selectedChat?.id,
      message,
      attachments: [...attachments],
      entities: entities.map((entity) => ({ ...entity })),
      reminderType,
    };
    setSendingNow(true);
    try {
      const sent = await onSendNow(submittedDraft.message, submittedDraft.attachments, submittedDraft.entities);
      if (sent) {
        const currentDraft = currentDraftRef.current;
        if (
          currentDraft.message === submittedDraft.message
          && currentDraft.selectedChatId === submittedDraft.chatId
          && areAttachmentsEqual(currentDraft.attachments, submittedDraft.attachments)
          && areEntitiesEqual(currentDraft.entities, submittedDraft.entities)
          && currentDraft.reminderType === submittedDraft.reminderType
        ) {
          onMessageChange('');
          onEntitiesChange([]);
          onAttachmentsChange([]);
          updateReminderType(null);
        }
        showActionFeedback('sent');
      } else {
        showActionFeedback('failed');
      }
    } catch {
      showActionFeedback('failed');
    } finally {
      setSendingNow(false);
    }
  };

  useEffect(() => {
    const pendingSchedule = pendingScheduleRef.current;
    if (!pendingSchedule) return;

    const record = upcoming.find((item) => (
      !pendingSchedule.previousIds.has(item.id)
      && item.chatId === pendingSchedule.chatId
      && item.text === pendingSchedule.message
      && Math.abs(new Date(item.when).getTime() - pendingSchedule.timestamp) < 1000
      && (item.attachments ?? []).length === pendingSchedule.attachments.length
      && (item.attachments ?? []).every((attachment, index) => attachment === pendingSchedule.attachments[index])
    ));
    if (!record) return;

    pendingScheduleRef.current = null;
    showActionFeedback('scheduled');
    if (
      message === pendingSchedule.message
      && currentDraftRef.current.selectedChatId === pendingSchedule.chatId
      && areAttachmentsEqual(attachments, pendingSchedule.attachments)
      && areEntitiesEqual(entities, pendingSchedule.entities)
      && reminderType === pendingSchedule.reminderType
    ) {
      onMessageChange('');
      onEntitiesChange([]);
      onAttachmentsChange([]);
      updateReminderType(null);
    }
  }, [attachments, entities, message, onAttachmentsChange, onEntitiesChange, onMessageChange, reminderType, showActionFeedback, upcoming]);

  useEffect(() => {
    let timeoutId = 0;
    const tick = () => {
      setCurrentTime(new Date());
      timeoutId = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 25);
    };
    const resync = () => {
      if (document.hidden) return;
      window.clearTimeout(timeoutId);
      tick();
    };
    tick();
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, []);

  useEffect(() => () => {
    if (actionFeedbackTimeoutRef.current !== null) window.clearTimeout(actionFeedbackTimeoutRef.current);
    if (blockedWarningTimeoutRef.current !== null) window.clearTimeout(blockedWarningTimeoutRef.current);
    if (draftSelectionHintTimeoutRef.current !== null) window.clearTimeout(draftSelectionHintTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (scheduleDate && scheduleTime && scheduleDateTime < minimumScheduleDateTime) {
      setScheduleDateTime(minimumScheduleDateTime);
    }
  }, [minimumScheduleDateTime, scheduleDate, scheduleDateTime, scheduleTime]);

  useEffect(() => {
    if (!permissionWarningPulse) return;
    const timer = window.setTimeout(() => setPermissionWarningPulse(false), 1000);
    return () => window.clearTimeout(timer);
  }, [permissionWarningPulse]);

  useEffect(() => {
    if (previousMessageRef.current === message) return;
    const caret = Math.min(selectionRef.current.start, message.length);
    selectionRef.current = { start: caret, end: caret };
    previousMessageRef.current = message;
  }, [message]);

  const handleTextChange = (nextMessage: string) => {
    onEntitiesChange(updateEntitiesForTextChange(entities, previousMessageRef.current, nextMessage));
    previousMessageRef.current = nextMessage;
    onMessageChange(nextMessage);
  };

  const rememberSelection = (textarea: HTMLTextAreaElement) => {
    selectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const insertEmoji = (emoji: string) => {
    const { start, end } = selectionRef.current;
    const nextMessage = limitMessageText(insertMessageText(message, emoji, start, end), MAX_PLANNER_TEXT);
    const nextCaret = Math.min(start + emoji.length, nextMessage.length);
    handleTextChange(nextMessage);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      const textarea = messageInputRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
      selectionRef.current = { start: nextCaret, end: nextCaret };
    });
  };

  const appendPlannerFiles = (files: File[]) => {
    const remainingSlots = MAX_PLANNER_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0 || files.length === 0) return;
    const getFilePath = window.telegram?.getFilePath;
    const paths = files.slice(0, remainingSlots).map((file) => (
      typeof getFilePath === 'function' ? getFilePath(file) : file.name
    ));
    if (paths.length) onAttachmentsChange([...attachments, ...paths]);
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendPlannerFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleComposeKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void runPlannerAction();
      return;
    }
    if (event.key === 'Escape') {
      setEmojiPickerOpen(false);
      setIsReminderTypePanelOpen(false);
      setShowAllAttachments(false);
    }
  };

  const handleComposePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    appendPlannerFiles(files);
  };

  const handleComposeDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    setIsDraggingFiles(true);
  };

  const handleComposeDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    appendPlannerFiles(files);
  };

  const selectedDrafts = savedPlannerDrafts.filter(({ id }) => selectedDraftIds.includes(id));
  const openPlannerDraftInStudio = (draft: SavedPlannerDraft) => {
    onOpenInStudio({
      text: draft.message,
      attachments: draft.attachments,
      entities: draft.entities,
    });
  };
  const openSelectedDraftInStudio = () => {
    if (selectedDrafts.length === 0) return;
    const textParts: string[] = [];
    const entities: RichTextEntity[] = [];
    const attachments: string[] = [];
    let textLength = 0;

    selectedDrafts.forEach((draft) => {
      if (draft.message) {
        if (textParts.length > 0) {
          textParts.push('\n\n');
          textLength += 2;
        }
        const offset = textLength;
        textParts.push(draft.message);
        textLength += draft.message.length;
        entities.push(...draft.entities.map((entity) => ({ ...entity, offset: entity.offset + offset })));
      }
      attachments.push(...draft.attachments);
    });

    onOpenInStudio({
      text: textParts.join(''),
      attachments,
      entities: mergeRichTextEntities(entities),
    });
  };
  const toggleDraftSelection = (draftId: string) => {
    setSelectedDraftIds((current) => current.includes(draftId)
      ? current.filter((id) => id !== draftId)
      : [...current, draftId]);
    hideDraftSelectionHint();
  };
  const deletePlannerDraft = (draftId: string) => {
    const nextDrafts = savedPlannerDrafts.filter(({ id }) => id !== draftId);
    if (!writeSavedPlannerDrafts(nextDrafts)) {
      showActionFeedback('failed');
      return;
    }
    setSavedPlannerDrafts(nextDrafts);
    setSelectedDraftIds((current) => current.filter((id) => id !== draftId));
    hideDraftSelectionHint();
  };
  const togglePlannerDraftPin = (draftId: string) => {
    const nextDrafts = sortPlannerDraftsByPinned(savedPlannerDrafts.map((draft) => (
      draft.id === draftId ? { ...draft, pinned: !draft.pinned } : draft
    )));
    if (!writeSavedPlannerDrafts(nextDrafts)) {
      showActionFeedback('failed');
      return;
    }
    setSavedPlannerDrafts(nextDrafts);
  };
  const togglePreviewPin = (mode: 'history' | 'queue', itemId: string) => {
    if (mode === 'history' && sentHistory !== undefined) {
      setPinnedHistoryIds((current) => current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]);
      return;
    }
    const setGroups = mode === 'queue' ? setQueuePreviewGroups : setHistoryMockGroups;
    setGroups((current) => current.map((group) => ({
      ...group,
      items: group.items.map((item) => item.id === itemId ? { ...item, pinned: !item.pinned } : item),
    })));
  };
  const removePreviewItem = (mode: 'history' | 'queue', itemId: string) => {
    if (mode === 'history' && sentHistory !== undefined) {
      setHiddenHistoryIds((current) => current.includes(itemId) ? current : [...current, itemId]);
      setPinnedHistoryIds((current) => current.filter((id) => id !== itemId));
      return;
    }
    const setGroups = mode === 'queue' ? setQueuePreviewGroups : setHistoryMockGroups;
    setGroups((current) => current
      .map((group) => ({ ...group, items: group.items.filter((item) => item.id !== itemId) }))
      .filter(({ items }) => items.length > 0));
  };
  const previewMode = publishMode === 'schedule' ? 'queue' : 'history';
  const visibleHistoryGroups = useMemo(
    () => sentHistory === undefined
      ? historyMockGroups
      : buildHistoryPreviewGroups(sentHistory, pinnedHistoryIds, hiddenHistoryIds),
    [hiddenHistoryIds, historyMockGroups, pinnedHistoryIds, sentHistory],
  );
  const visiblePreviewGroups = previewMode === 'queue' ? queuePreviewGroups : visibleHistoryGroups;
  const pinnedPreviewItems = visiblePreviewGroups.flatMap(({ items }) => items).filter(({ pinned }) => pinned);
  const visiblePreviewListGroups = [
    ...(pinnedPreviewItems.length > 0 ? [{ label: 'Pinned', items: pinnedPreviewItems }] : []),
    ...visiblePreviewGroups
      .map(({ label, items }) => ({ label, items: items.filter(({ pinned }) => !pinned) }))
      .filter(({ items }) => items.length > 0),
  ];
  const handlePreviewListScroll = () => {
    const list = plannerPreviewListRef.current;
    if (!list) return;
    updatePreviewScrollbar();
    setPreviewScrollPositions((current) => (
      current[previewMode] === list.scrollTop ? current : { ...current, [previewMode]: list.scrollTop }
    ));
  };

  useLayoutEffect(() => {
    const list = plannerPreviewListRef.current;
    if (!list) return;
    list.scrollTop = previewScrollPositions[previewMode];
    updatePreviewScrollbar();
  }, [previewMode, previewScrollPositions, updatePreviewScrollbar, visiblePreviewGroups]);

  useEffect(() => {
    updatePreviewScrollbar();
    const list = plannerPreviewListRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(updatePreviewScrollbar);
    observer.observe(list);
    list.querySelectorAll('.quick-planner-mode-preview-row, .quick-planner-mode-preview-group').forEach((item) => observer.observe(item));
    window.addEventListener('resize', updatePreviewScrollbar);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePreviewScrollbar);
    };
  }, [previewMode, updatePreviewScrollbar, visiblePreviewGroups]);

  const expandedPlannerDraft = publishMode === 'draft'
    ? savedPlannerDrafts.find(({ id }) => id === expandedPreviewMessageId) ?? null
    : null;
  const expandedDraftDate = expandedPlannerDraft?.savedAt ? new Date(expandedPlannerDraft.savedAt) : null;
  const expandedPreviewMessage = expandedPlannerDraft
    ? {
      id: expandedPlannerDraft.id,
      time: expandedDraftDate && !Number.isNaN(expandedDraftDate.getTime())
        ? expandedDraftDate.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
        : '',
      chat: t('quickplanner.savedDraft'),
      message: expandedPlannerDraft.message || t('quickplanner.draftWithAttachments', { count: expandedPlannerDraft.attachments.length }),
    }
    : expandedPreviewMessageId && publishMode !== 'draft'
      ? visiblePreviewGroups.flatMap(({ items }) => items).find(({ id }) => id === expandedPreviewMessageId) ?? null
      : null;
  useEffect(() => {
    updatePreviewScrollbar();
    const list = plannerPreviewListRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(updatePreviewScrollbar);
    observer.observe(list);
    list.querySelectorAll('.quick-planner-mode-preview-row, .quick-planner-mode-preview-group').forEach((item) => observer.observe(item));
    window.addEventListener('resize', updatePreviewScrollbar);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePreviewScrollbar);
    };
  }, [previewMode, updatePreviewScrollbar, visiblePreviewGroups]);

  const calendarYear = calendarCursor.getFullYear();
  const calendarMonth = calendarCursor.getMonth();
  const calendarFirstWeekdayOffset = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDayCount = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarMonthKey = calendarYear * 12 + calendarMonth;
  const minimumMonthKey = Number(minimumScheduleDateValue.slice(0, 4)) * 12 + Number(minimumScheduleDateValue.slice(5, 7)) - 1;
  const calendarDateLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const calendarWeekdayLabels = Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(calendarDateLocale, { weekday: 'short' })
      .format(new Date(Date.UTC(2023, 0, 2 + index)))
  ));
  const calendarMonthLabel = new Intl.DateTimeFormat(calendarDateLocale, { month: 'long', year: 'numeric' }).format(calendarCursor);

  return (
    <section
      className={`quick-planner-page${draftOnlyMode ? ' is-browser-draft-only' : ''}`}
      aria-labelledby="quick-planner-title"
      lang={locale}
      data-publish-mode={publishMode}
      style={{
        '--quick-planner-accent': quickPlannerAccent,
        '--quick-planner-accent-soft': `rgba(${quickPlannerAccent}, 0.12)`,
      } as CSSProperties}
    >
      <header className="quick-planner-header">
          <div className="quick-planner-heading">
            <Zap size={19} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <h1 id="quick-planner-title">{t('quickplanner.title')}</h1>
            </div>
          </div>
      </header>

      <div className="quick-planner-layout">
          <aside className="quick-planner-sidebar">
            <nav className="quick-planner-nav" aria-label={t('quickplanner.navigation')}>
              <button
                className={`quick-planner-nav-item${currentSection === 'studio' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'studio' ? 'page' : undefined}
                onClick={openStudio}
              >
                <FileText size={16} aria-hidden="true" />
                <span>{t('product.studio')}</span>
              </button>
              <button
                className={`quick-planner-nav-item${currentSection === 'posts' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'posts' ? 'page' : undefined}
                onClick={openPosts}
              >
                <History size={16} aria-hidden="true" />
                <span>{t('product.posts')}</span>
              </button>
              <button
                className={`quick-planner-nav-item${currentSection === 'settings' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'settings' ? 'page' : undefined}
                onClick={openSettings}
              >
                <Settings size={16} aria-hidden="true" />
                <span>{t('product.settings')}</span>
              </button>
            </nav>
            <p className="quick-planner-sidebar-note">{sidebarMotivation}</p>
            </aside>

            <div ref={plannerEditorRef} className="quick-planner-editor" style={plannerEditorResizeStyle}>
              <div className="quick-planner-clock">
                <div className="quick-planner-clock-body">
                  <div className="quick-planner-clock-date">
                    <span className="quick-planner-clock-label">Today</span>
                    <time dateTime={currentTime.toISOString()}>{formatToday(currentTime)}</time>
                  </div>
                  <div className="quick-planner-clock-time">
                    <time dateTime={currentTime.toISOString()}>{formatCurrentTime(currentTime)}</time>
                  </div>
                </div>
              </div>
              <div className="quick-planner-editor-heading">
                <span className="quick-planner-section-label">{t('quickplanner.createReminder')}</span>
              </div>
              <div className="quick-planner-heading-actions">
                <div className="quick-planner-mode-switch" role="group" aria-label={t('quickplanner.actionMode')}>
                  <span className="quick-planner-mode-caption">{t('quickplanner.currentAction')}</span>
                  {plannerModeOptions.map(({ id, label, icon: ModeIcon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={publishMode === id}
                      className={publishMode === id ? 'is-selected' : ''}
                      onClick={() => {
                        setPublishMode(id);
                        if (id !== 'draft') setIsReminderTypePanelOpen(false);
                      }}
                    >
                      <ModeIcon size={13} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {publishMode !== 'draft' && (
                <div className="quick-planner-chat-picker">
                  <span className="quick-planner-mode-caption">{t('quickplanner.sendTo')}</span>
                  <ChatPicker
                    chats={chats}
                    selectedChat={selectedChat}
                    onSelect={onSelectChat}
                    onAddChat={onAddChat}
                    onRemoveChat={onRemoveChat}
                    onError={onChatPickerError}
                    permissionWarning={permissionWarningText}
                    warningPulse={permissionWarningPulse}
                    showRecentGroups
                    showRemoveControl
                  />
                </div>
              )}
              {publishMode === 'draft' && <div className="quick-planner-chat-picker-placeholder" aria-hidden="true" />}
            <div className="quick-planner-compose-anchor" style={composeResizeStyle}>
                <div className="quick-planner-type-controls-spacer" aria-hidden="true" />
            <section
              className={`quick-planner-compose${isResizingCompose ? ' is-resizing' : ''}${isDraggingFiles ? ' is-drag-over' : ''}`}
              aria-label="New reminder"
              onDragOver={handleComposeDragOver}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setIsDraggingFiles(false);
              }}
              onDrop={handleComposeDrop}
            >
              <div className="quick-planner-compose-input-row">
                <textarea
                  ref={messageInputRef}
                  aria-label="Reminder text"
                  aria-describedby="quick-planner-counter"
                  maxLength={MAX_PLANNER_TEXT}
                  value={message}
                  readOnly={isPermissionBlocked}
                  title={isPermissionBlocked ? 'Нет доступа' : undefined}
                  onClick={() => {
                    if (isPermissionBlocked) setPermissionWarningPulse(true);
                  }}
                  onChange={(event) => {
                    if (isPermissionBlocked) {
                      setPermissionWarningPulse(true);
                      return;
                    }
                    rememberSelection(event.currentTarget);
                    handleTextChange(event.target.value);
                  }}
                  onSelect={(event) => {
                    if (isPermissionBlocked) {
                      setPermissionWarningPulse(true);
                      return;
                    }
                    rememberSelection(event.currentTarget);
                  }}
                  onKeyUp={(event) => rememberSelection(event.currentTarget)}
                  onMouseUp={(event) => rememberSelection(event.currentTarget)}
                  onKeyDown={handleComposeKeyDown}
                  onPaste={handleComposePaste}
                  placeholder="Capture what matters..."
                />
                <div className="quick-planner-compose-clear-rail">
                  {message && (
                    <button
                      className="quick-planner-clear"
                      type="button"
                      aria-label="Clear reminder text"
                      title="Clear text"
                      onClick={() => {
                        onEntitiesChange([]);
                        onMessageChange('');
                      }}
                    >
                      <Eraser size={17} aria-hidden="true" />
                    </button>
                  )}
                  <span
                    id="quick-planner-counter"
                    className={`quick-planner-counter${message.length === 0 ? ' is-empty' : ''}${message.length >= MAX_PLANNER_TEXT ? ' is-limit' : message.length > MAX_PLANNER_TEXT - 50 ? ' is-warning' : ''}`}
                  >{message.length} / {MAX_PLANNER_TEXT}</span>
                </div>
              </div>
              {attachments.length > 0 && (() => {
                const visibleChips = attachments.slice(0, MAX_VISIBLE_ATTACHMENT_CHIPS);
                const hiddenChips = attachments.slice(MAX_VISIBLE_ATTACHMENT_CHIPS);
                const renderChip = (attachment: string, index: number) => {
                  const name = attachment.split(/[\\/]/).pop() || attachment;
                  return (
                    <span className="quick-planner-attachment" key={`${attachment}-${index}`}>
                      <Paperclip size={11} aria-hidden="true" />
                      <span>{name}</span>
                      <button type="button" aria-label={`Remove ${name}`} onClick={() => onAttachmentsChange(attachments.filter((_, itemIndex) => itemIndex !== index))}>
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  );
                };
                return (
                  <div className={`quick-planner-attachments${attachments.length > 4 ? ' has-many' : ''}`} aria-label="Attachments">
                    <div className="quick-planner-attachments-scroll">
                      {visibleChips.map(renderChip)}
                    </div>
                    {hiddenChips.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="quick-planner-attachments-more"
                          aria-label={showAllAttachments ? 'Hide extra attachments' : `Show ${hiddenChips.length} more attachments`}
                          aria-expanded={showAllAttachments}
                          aria-controls="quick-planner-attachments-extra"
                          title={showAllAttachments ? 'Show less' : 'Show more attachments'}
                          onClick={() => setShowAllAttachments((isOpen) => !isOpen)}
                        >
                          {showAllAttachments ? <X size={11} aria-hidden="true" /> : `+${hiddenChips.length}`}
                        </button>
                        {showAllAttachments && (
                          <div id="quick-planner-attachments-extra" className="quick-planner-attachments-extra" role="group" aria-label="Extra attachments">
                            {hiddenChips.map((attachment, offset) => renderChip(attachment, offset + MAX_VISIBLE_ATTACHMENT_CHIPS))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              <input
                ref={fileInputRef}
                className="quick-planner-file-input"
                type="file"
                multiple
                aria-label="Planner attachment files"
                onChange={handleFileSelection}
              />
              {emojiPickerOpen && (
                <div id="quick-planner-emoji-picker" className="quick-planner-emoji-picker" role="group" aria-label="Choose emoji">
                  {plannerEmojis.map((emoji) => (
                    <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>
                  ))}
                </div>
              )}
              <div className="quick-planner-compose-footer">
                <div className="quick-planner-tools">
                  <button
                    type="button"
                    aria-label="Add emoji"
                    aria-expanded={emojiPickerOpen}
                    aria-controls="quick-planner-emoji-picker"
                    title="Emoji"
                    onClick={() => setEmojiPickerOpen((open) => !open)}
                  ><Smile size={18} aria-hidden="true" /></button>
                  <button type="button" aria-label="Add attachment" title="Attachment" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} aria-hidden="true" /></button>
                  {publishMode === 'draft' && (
                    <div className={`quick-planner-type-controls ${isReminderTypePanelOpen ? 'is-open' : ''}`}>
                      {isReminderTypePanelOpen && (
                        <div id="quick-planner-reminder-types" className="quick-planner-reminder-types" role="group" aria-label={t('quickplanner.reminderTypes')}>
                          <button
                            type="button"
                            onClick={() => {
                              updateReminderType(null);
                              setIsReminderTypePanelOpen(false);
                            }}
                          >
                            <span>{t('quickplanner.reminderType.none')}</span>
                          </button>
                          {reminderTypes.map(({ id, label, icon: TypeIcon }) => (
                            <button
                              key={id}
                              type="button"
                              className={reminderType === id ? 'is-selected' : ''}
                              onClick={() => {
                                updateReminderType(id);
                                setIsReminderTypePanelOpen(false);
                              }}
                            >
                              <TypeIcon size={12} aria-hidden="true" />
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        className={`quick-planner-type-toggle${selectedReminderType && !isReminderTypePanelOpen ? ' is-selected' : ''}${!selectedReminderType && !isReminderTypePanelOpen ? ' is-add-tag' : ''}`}
                        type="button"
                        aria-label={isReminderTypePanelOpen
                          ? t('quickplanner.closeReminderTypes')
                          : selectedReminderType
                            ? t('quickplanner.changeReminderType', { type: selectedReminderType.label })
                            : t('quickplanner.addReminderType')}
                        aria-expanded={isReminderTypePanelOpen}
                        aria-controls="quick-planner-reminder-types"
                        title={isReminderTypePanelOpen
                          ? t('quickplanner.closeReminderTypes')
                          : selectedReminderType
                            ? t('quickplanner.changeReminderType', { type: selectedReminderType.label })
                            : t('quickplanner.addReminderType')}
                        onClick={() => setIsReminderTypePanelOpen((isOpen) => !isOpen)}
                      >
                        {isReminderTypePanelOpen ? <X size={12} aria-hidden="true" /> : selectedReminderType && SelectedReminderTypeIcon ? (
                          <>
                            <SelectedReminderTypeIcon size={14} aria-hidden="true" />
                            <span>{selectedReminderType.label}</span>
                          </>
                        ) : (
                          <>
                            <Plus size={14} aria-hidden="true" />
                            <span>{t('quickplanner.addReminderType')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {publishMode === 'schedule' && (
                    <div className="quick-planner-schedule-controls" role="group" aria-label="Schedule date and time">
                      <label ref={scheduleDatePillRef} className="quick-planner-schedule-date" title="Schedule date">
                        <CalendarDays
                          size={15}
                          role="button"
                          tabIndex={0}
                          aria-label="Open date picker"
                          aria-haspopup="dialog"
                          aria-expanded={datePickerOpen}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleScheduleDatePicker();
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            toggleScheduleDatePicker();
                          }}
                        />
                        <input
                          aria-label="Schedule date"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={scheduleDateDraft ?? formatScheduleDateLabel(scheduleDate)}
                          onChange={handleScheduleDateChange}
                          onBlur={handleScheduleDateBlur}
                          onPaste={handleScheduleDatePaste}
                        />
                      </label>
                      <label ref={scheduleTimePillRef} className="quick-planner-schedule-clock" title="Schedule time">
                        <Clock
                          size={15}
                          role="button"
                          tabIndex={0}
                          aria-label="Open time picker"
                          aria-haspopup="dialog"
                          aria-expanded={timePickerOpen}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleScheduleTimePicker();
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            toggleScheduleTimePicker();
                          }}
                        />
                        <input
                          aria-label="Schedule time"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={scheduleTimeDraft ?? scheduleTime}
                          onChange={handleScheduleTimeChange}
                          onBlur={handleScheduleTimeBlur}
                          onPaste={handleScheduleTimePaste}
                        />
                      </label>
                    </div>
                  )}
                  {datePickerOpen && createPortal(
                    <div
                      ref={scheduleDatePickerRef}
                      className="quick-planner-date-picker"
                      role="dialog"
                      aria-label="Schedule date picker"
                      style={{
                        top: schedulePickerPosition.top,
                        left: schedulePickerPosition.left,
                        '--quick-planner-accent': quickPlannerAccent,
                      } as CSSProperties}
                    >
                      <div className="quick-planner-date-picker-header">
                        <button
                          type="button"
                          aria-label="Previous month"
                          disabled={calendarMonthKey <= minimumMonthKey}
                          onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                        >
                          <ChevronLeft size={14} aria-hidden="true" />
                        </button>
                        <span className="quick-planner-date-picker-title">{calendarMonthLabel}</span>
                        <button
                          type="button"
                          aria-label="Next month"
                          onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                        >
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="quick-planner-date-picker-weekdays" aria-hidden="true">
                        {calendarWeekdayLabels.map((label) => <span key={label}>{label}</span>)}
                      </div>
                      <div className="quick-planner-date-picker-grid">
                        {Array.from({ length: calendarFirstWeekdayOffset }, (_, index) => (
                          <span key={`gap-${index}`} className="quick-planner-date-picker-gap" aria-hidden="true" />
                        ))}
                        {Array.from({ length: calendarDayCount }, (_, index) => {
                          const dayNumber = index + 1;
                          const cellValue = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
                          const isSelected = cellValue === scheduleDate;
                          const isToday = cellValue === todayScheduleDateValue;
                          const isDisabled = cellValue < minimumScheduleDateValue;
                          return (
                            <button
                              key={cellValue}
                              type="button"
                              disabled={isDisabled}
                              aria-pressed={isSelected}
                              className={`${isSelected ? 'is-selected' : ''}${isToday ? ' is-today' : ''}`.trim()}
                              onClick={() => {
                                if (isDisabled) return;
                                setScheduleDateTimeWithinRange(cellValue, scheduleTime || '12:00');
                                setDatePickerOpen(false);
                              }}
                            >
                              {dayNumber}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body,
                  )}
                  {timePickerOpen && createPortal(
                    <div
                      ref={scheduleTimePickerRef}
                      className="quick-planner-time-picker"
                      role="dialog"
                      aria-label="Schedule time picker"
                      style={{
                        top: schedulePickerPosition.top,
                        left: schedulePickerPosition.left,
                        '--quick-planner-accent': quickPlannerAccent,
                      } as CSSProperties}
                    >
                      <input
                        className="quick-planner-time-field"
                        aria-label="Enter schedule time"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        autoFocus
                        value={scheduleTimeDraft ?? scheduleTime}
                        onChange={handleScheduleTimeChange}
                        onBlur={handleScheduleTimeBlur}
                        onPaste={handleScheduleTimePaste}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          const parsed = parseScheduleTimeInput(event.currentTarget.value);
                          if (!parsed) return;
                          setScheduleTimeDraft(null);
                          setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateValue, parsed);
                          setTimePickerOpen(false);
                        }}
                      />
                      <div className="quick-planner-time-list" role="listbox" aria-label="Available times">
                        {scheduleTimeOptions.map((option) => {
                          const isSelected = option === scheduleTime;
                          const isPast = scheduleDate < minimumScheduleDateValue
                            || (scheduleDate === minimumScheduleDateValue && option < minimumScheduleTimeValue);
                          return (
                            <button
                              key={option}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              disabled={isPast}
                              onClick={() => {
                                setScheduleTimeDraft(null);
                                setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateValue, option);
                                setTimePickerOpen(false);
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body,
                  )}
                  {publishMode === 'schedule' && (
                    <div className="quick-planner-schedule-quick-values" role="group" aria-label="Quick schedule times">
                      {(['now', 'days', 'time'] as const).map((group) => (
                        <div
                          key={group}
                          className={`quick-planner-schedule-quick-group is-${group}`}
                          role="group"
                          aria-label={group === 'now' ? 'Quick now choice' : group === 'time' ? 'Time quick choices' : 'Day quick choices'}
                        >
                          {scheduleQuickOptions.filter((option) => option.group === group).map(({ label, ariaLabel, minutes, days }) => (
                            <button
                              key={label}
                              type="button"
                              aria-label={ariaLabel}
                              title={ariaLabel}
                              onClick={() => {
                                const nextDate = minutes === 0 ? new Date() : new Date(scheduleDateTime);
                                if (Number.isNaN(nextDate.getTime())) nextDate.setTime(Date.now());
                                if (minutes === 0) {
                                  nextDate.setMinutes(nextDate.getMinutes() + 1, 0, 0);
                                } else if (minutes !== undefined) {
                                  nextDate.setMinutes(nextDate.getMinutes() + minutes, 0, 0);
                                } else {
                                  nextDate.setDate(nextDate.getDate() + (days ?? 0));
                                  nextDate.setSeconds(0, 0);
                                }
                                setScheduleDateTime(toLocalDateTimeValue(nextDate));
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="quick-planner-action-group">
                  {publishMode === 'draft' && (
                    <button
                      className="quick-planner-open-studio"
                      type="button"
                      onClick={() => onOpenInStudio({ text: message, attachments, entities })}
                    >
                      <ArrowUpRight size={14} aria-hidden="true" />
                      <span>Open in Studio</span>
                    </button>
                  )}
                  <button
                    className={`quick-planner-send${actionButtonSucceeded ? ' is-success' : actionFeedback === 'failed' ? ' is-error' : blockedWarning ? ' is-warning' : ''}`}
                    type="button"
                    aria-label={actionButtonLabel ?? (publishMode === 'send' ? 'Send reminder' : publishMode === 'schedule' ? 'Schedule reminder' : 'Save draft')}
                    aria-live="polite"
                    aria-describedby={hasVisiblePlannerStatus ? 'quick-planner-action-status' : undefined}
                    title={actionButtonLabel ?? (publishMode === 'send' ? 'Send reminder' : publishMode === 'schedule' ? 'Schedule reminder' : 'Save draft')}
                    disabled={actionInFlight}
                    onClick={() => void runPlannerAction()}
                  >
                    {blockedWarning
                      ? <AlertTriangle size={18} strokeWidth={2.4} aria-hidden="true" />
                      : actionFeedback === 'failed'
                      ? <X size={18} strokeWidth={2.4} aria-hidden="true" />
                      : actionButtonSucceeded
                        ? <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                        : publishMode === 'send'
                          ? <Send size={21} strokeWidth={2.2} aria-hidden="true" />
                          : publishMode === 'schedule'
                            ? <CalendarDays size={18} aria-hidden="true" />
                            : <FileText size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button
                className="quick-planner-resize-handle"
                type="button"
                aria-label="Resize reminder field height"
                title="Resize reminder field height"
                onPointerDown={handleComposeResizePointerDown}
                onPointerMove={handleComposeResizePointerMove}
                onPointerUp={finishComposeResize}
                onPointerCancel={finishComposeResize}
                onKeyDown={handleComposeResizeKeyDown}
              >
                <svg className="quick-planner-resize-grip" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M10.5 1.5 12.5 3.5" />
                  <path d="M7 1.5 12.5 7" />
                  <path d="M2 1.5 12.5 12" />
                </svg>
              </button>
            </section>
            </div>
            <div className="messages-panel-wrapper" aria-hidden={!hasVisiblePlannerStatus}>
              {currentPlannerStatus && hasVisiblePlannerStatus && (
                <div
                  id="quick-planner-action-status"
                  key={notification?.revision ?? `${currentPlannerStatus.type}:${currentPlannerStatus.message}`}
                  className={`planner-inline-notification ${isShortPlannerNotification ? 'is-short' : 'is-long'} is-${currentPlannerStatus.type}${isMassWarningNotification ? ' is-mass-warning' : ''}${hasPlannerNotification && closeNotification ? ' is-dismissible' : ''}`}
                  role={currentPlannerStatus.type === 'error' ? 'alert' : 'status'}
                  aria-live={currentPlannerStatus.type === 'error' ? 'assertive' : 'polite'}
                >
                  <span className={isMassWarningNotification ? 'planner-notification-message' : 'planner-notification-text'}>{currentPlannerStatus.message}</span>
                  {hasPlannerNotification && closeNotification && (
                    <button type="button" className="planner-inline-notification-close" onClick={closeNotification} aria-label="Close notification">×</button>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="quick-planner-upcoming-column">
            {publishMode === 'draft' ? (
              <>
            <div className="quick-planner-upcoming">
            <div className="quick-planner-upcoming-heading">
              <span className="quick-planner-section-label quick-planner-panel-title"><Zap size={13} strokeWidth={2.3} aria-hidden="true" />{savedPlannerDrafts.length >= 2 ? t('quickplanner.drafts') : t('quickplanner.mode.draft')}</span>
              <span>{t('quickplanner.draftCollection')}{savedPlannerDrafts.length > 0 ? ` · ${savedPlannerDrafts.length.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}` : ''}</span>
            </div>
            <div className="quick-planner-reminder-scroll-area">
              <div
                id="quick-planner-draft-list"
                ref={plannerDraftListRef}
                className="quick-planner-reminder-list"
                role="list"
                aria-label={t('quickplanner.draftsListLabel')}
                onScroll={updateDraftScrollbar}
              >
              {savedPlannerDrafts.length > 0 ? savedPlannerDrafts.map((draft, index) => {
                const draftReminderType = reminderTypes.find(({ id }) => id === draft.reminderType);
                const DraftReminderIcon = draftReminderType?.icon;
                const draftSummary = draft.message.trim()
                  ? draft.message
                  : draft.attachments.length === 1
                    ? t('quickplanner.draftWithOneAttachment')
                    : t('quickplanner.draftWithAttachments', { count: draft.attachments.length });
                const savedDate = draft.savedAt ? new Date(draft.savedAt) : null;
                const savedLabel = savedDate && !Number.isNaN(savedDate.getTime())
                  ? savedDate.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
                  : '';

                return (
                  <article
                    className={`quick-planner-draft${selectedDraftIds.includes(draft.id) ? ' is-selected' : ''}`}
                    key={draft.id}
                    role="listitem"
                    tabIndex={0}
                    aria-label={t('quickplanner.openDraftLabel', { draft: draftSummary })}
                    aria-expanded={publishMode === 'draft' && expandedPreviewMessageId === draft.id}
                    onClick={(event) => {
                      const target = event.target;
                      if (target instanceof Element && target.closest('button, input, label')) return;
                      setExpandedPreviewMessageId(draft.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                      event.preventDefault();
                      setExpandedPreviewMessageId(draft.id);
                    }}
                  >
                    <div className="quick-planner-draft-heading">
                      <div className="quick-planner-draft-heading-main">
                        <label className="quick-planner-draft-select">
                        <input
                          type="checkbox"
                          value={draft.id}
                          checked={selectedDraftIds.includes(draft.id)}
                          title={t(selectedDraftIds.includes(draft.id) ? 'quickplanner.deselectThisDraft' : 'quickplanner.selectThisDraft')}
                          onChange={() => toggleDraftSelection(draft.id)}
                          aria-label={t(selectedDraftIds.includes(draft.id) ? 'quickplanner.deselectDraftLabel' : 'quickplanner.selectDraftLabel', { draft: draftSummary })}
                        />
                        </label>
                        <strong>{savedPlannerDrafts.length - index === 1
                          ? t('quickplanner.savedDraft')
                          : t('quickplanner.savedDraftNumber', { number: savedPlannerDrafts.length - index })}</strong>
                      </div>
                      <div className="quick-planner-draft-actions">
                        <button
                          type="button"
                          className="quick-planner-draft-open"
                          onClick={() => openPlannerDraftInStudio(draft)}
                          aria-label={t('quickplanner.openDraftInStudio', { draft: draftSummary })}
                          title={t('quickplanner.openThisDraftInStudio')}
                        >
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`quick-planner-draft-pin${draft.pinned ? ' is-pinned' : ''}`}
                          onClick={() => togglePlannerDraftPin(draft.id)}
                          aria-label={t(draft.pinned ? 'quickplanner.unpinDraft' : 'quickplanner.pinDraft', { draft: draftSummary })}
                          aria-pressed={Boolean(draft.pinned)}
                          title={t(draft.pinned ? 'quickplanner.unpinDraftTitle' : 'quickplanner.pinDraftTitle')}
                        >
                          <Pin size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="quick-planner-draft-delete"
                          onClick={() => deletePlannerDraft(draft.id)}
                          aria-label={t('quickplanner.deleteDraft', { draft: draftSummary })}
                          title={t('quickplanner.deleteDraftTitle')}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <span>{draftSummary}</span>
                    {(savedLabel || draftReminderType) && (
                      <div className="quick-planner-draft-info">
                        {savedLabel && <time dateTime={draft.savedAt}>{savedLabel}</time>}
                        {draftReminderType && (
                          <small className="quick-planner-draft-tag" data-reminder-type={draft.reminderType ?? undefined}>
                            {DraftReminderIcon && <DraftReminderIcon size={13} aria-hidden="true" />}
                            {draftReminderType.label}
                          </small>
                        )}
                      </div>
                    )}
                    {draft.attachments.map((attachment, attachmentIndex) => (
                      <small key={`${attachment}-${attachmentIndex}`}>
                        <Paperclip size={11} aria-hidden="true" />
                        <span>{attachment.split(/[\\/]/).pop() || attachment}</span>
                      </small>
                    ))}
                  </article>
                );
              }) : <p className="quick-planner-empty">{t('quickplanner.noSavedDrafts')}</p>}
              </div>
              <div
                ref={plannerDraftScrollbarRef}
                className={`quick-planner-draft-scrollbar${draftScrollbar.scrollable ? ' is-scrollable' : ''}`}
                aria-hidden={!draftScrollbar.scrollable}
              >
                <div
                  className="quick-planner-draft-scrollbar-thumb"
                  role="scrollbar"
                  aria-label={t('quickplanner.scrollDrafts')}
                  aria-controls="quick-planner-draft-list"
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={Math.max(0, (plannerDraftListRef.current?.scrollHeight ?? 0) - (plannerDraftListRef.current?.clientHeight ?? 0))}
                  aria-valuenow={plannerDraftListRef.current?.scrollTop ?? 0}
                  tabIndex={draftScrollbar.scrollable ? 0 : -1}
                  style={{
                    height: `${draftScrollbar.height}px`,
                    transform: `translateY(${draftScrollbar.offset}px)`,
                  }}
                  onPointerDown={handleDraftScrollbarPointerDown}
                  onPointerMove={handleDraftScrollbarPointerMove}
                  onPointerUp={finishDraftScrollbarDrag}
                  onPointerCancel={finishDraftScrollbarDrag}
                  onKeyDown={handleDraftScrollbarKeyDown}
                />
              </div>
            </div>
            </div>
            <div className={`quick-planner-open-studio-footer${savedPlannerDrafts.length >= 2 ? ' has-multiple-drafts' : ''}`}>
              {selectedDrafts.length === 0 && showDraftSelectionHint && (
                <p className="quick-planner-draft-selection-hint" role="status">
                  {t('quickplanner.selectDraftHint')}
                </p>
              )}
              <button
                className="quick-planner-open-studio-full"
                type="button"
                onClick={() => {
                  if (selectedDrafts.length === 0) {
                    showDraftSelectionHintForMoment();
                    return;
                  }
                  openSelectedDraftInStudio();
                }}
                title={t(selectedDrafts.length === 1 ? 'quickplanner.openSelectedDraft' : 'quickplanner.openSelectedDrafts', { count: selectedDrafts.length })}
                aria-label={t(selectedDrafts.length === 1 ? 'quickplanner.openSelectedDraft' : 'quickplanner.openSelectedDrafts', { count: selectedDrafts.length })}
              >
                <ArrowUpRight size={18} />
                <span>{t('quickplanner.openDraftsInStudio')}</span>
                <span className="quick-planner-open-studio-count" aria-hidden="true">{selectedDrafts.length}</span>
              </button>
            </div>
              </>
            ) : (
              <div className="quick-planner-upcoming">
                <div className="quick-planner-upcoming-heading">
                  <span className="quick-planner-section-label quick-planner-panel-title">
                    <Zap size={13} strokeWidth={2.3} aria-hidden="true" />
                    {t(publishMode === 'schedule' ? 'quickplanner.queue' : 'quickplanner.history')}
                  </span>
                </div>
                <div className="quick-planner-mode-preview-scroll-area">
                  <div
                    id="quick-planner-mode-preview-list"
                    ref={plannerPreviewListRef}
                    className="quick-planner-mode-preview-list"
                    onScroll={handlePreviewListScroll}
                  >
                    {visiblePreviewListGroups.length > 0 ? visiblePreviewListGroups.map(({ label, items }) => (
                      <section className="quick-planner-mode-preview-group" key={label} aria-label={label}>
                        <h3 className="quick-planner-mode-preview-group-label">{label}</h3>
                        <div className="quick-planner-mode-preview-rows" role="list" aria-label={`${label} messages`}>
                          {items.map(({ id, time, chat, message, pinned }) => {
                            const pinLabel = `${pinned ? 'Unpin' : 'Pin'} ${previewMode === 'queue' ? 'queued' : 'history'} message from ${chat} at ${time}`;
                            const removeLabel = previewMode === 'queue'
                              ? `Cancel scheduled message to ${chat} at ${time}`
                              : `Delete history message from ${chat} at ${time}`;

                            return (
                              <div
                                className={`quick-planner-mode-preview-row${pinned ? ' is-pinned' : ''}`}
                                key={id}
                                role="listitem"
                                tabIndex={0}
                                aria-label={`Open message from ${chat} at ${time}`}
                                onClick={(event) => {
                                  if (event.target instanceof Element && event.target.closest('button')) return;
                                  setExpandedPreviewMessageId(id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                                  event.preventDefault();
                                  setExpandedPreviewMessageId(id);
                                }}
                              >
                                <time className="quick-planner-mode-preview-time">{time}</time>
                                <div className="quick-planner-mode-preview-copy">
                                  <span className="quick-planner-mode-preview-chat">{chat}</span>
                                  <span className="quick-planner-mode-preview-message">{message}</span>
                                </div>
                                <div className="quick-planner-mode-preview-actions">
                                  <button
                                    className={`quick-planner-mode-preview-action${pinned ? ' is-pinned' : ''}`}
                                    type="button"
                                    aria-label={pinLabel}
                                    aria-pressed={Boolean(pinned)}
                                    title={pinLabel}
                                    onClick={() => togglePreviewPin(previewMode, id)}
                                  >
                                    <Pin size={13} strokeWidth={1.8} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
                                  </button>
                                  <button
                                    className="quick-planner-mode-preview-action"
                                    type="button"
                                    aria-label={removeLabel}
                                    title={removeLabel}
                                    onClick={() => removePreviewItem(previewMode, id)}
                                  >
                                    {previewMode === 'queue' ? <X size={13} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )) : <p className="quick-planner-mode-preview-empty">No sent messages yet.</p>}
                  </div>
                  <div
                    ref={plannerPreviewScrollbarRef}
                    className={`quick-planner-mode-preview-scrollbar${previewScrollbar.scrollable ? ' is-scrollable' : ''}`}
                    aria-hidden={!previewScrollbar.scrollable}
                  >
                    <div
                      className="quick-planner-mode-preview-scrollbar-thumb"
                      role="scrollbar"
                      aria-label={`Scroll ${previewMode === 'queue' ? 'queue' : 'history'}`}
                      aria-controls="quick-planner-mode-preview-list"
                      aria-orientation="vertical"
                      aria-valuemin={0}
                      aria-valuemax={Math.max(0, (plannerPreviewListRef.current?.scrollHeight ?? 0) - (plannerPreviewListRef.current?.clientHeight ?? 0))}
                      aria-valuenow={plannerPreviewListRef.current?.scrollTop ?? 0}
                      tabIndex={previewScrollbar.scrollable ? 0 : -1}
                      style={{
                        height: `${previewScrollbar.height}px`,
                        transform: `translateY(${previewScrollbar.offset}px)`,
                      }}
                      onPointerDown={handlePreviewScrollbarPointerDown}
                      onPointerMove={handlePreviewScrollbarPointerMove}
                      onPointerUp={finishPreviewScrollbarDrag}
                      onPointerCancel={finishPreviewScrollbarDrag}
                      onKeyDown={handlePreviewScrollbarKeyDown}
                    />
                  </div>
                </div>
              </div>
            )}
            {expandedPreviewMessage && (
              <div className="quick-planner-full-message" role="dialog" aria-modal="true" aria-labelledby="quick-planner-full-message-title">
                <div className="quick-planner-full-message-header">
                  <div className="quick-planner-full-message-meta">
                    <span>{expandedPreviewMessage.chat}</span>
                    <time>{expandedPreviewMessage.time}</time>
                  </div>
                  <button
                    className="quick-planner-full-message-close"
                    type="button"
                    aria-label={t('quickplanner.closeFullMessage')}
                    title={t('common.close')}
                    onClick={() => setExpandedPreviewMessageId(null)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <p id="quick-planner-full-message-title" className="quick-planner-full-message-text">{expandedPreviewMessage.message}</p>
              </div>
            )}
          </aside>
      </div>
    </section>
  );
}