import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
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
  X,
  Zap,
} from 'lucide-react';
import type { Chat, ChatPermissions, NotificationState, NotificationType, RichTextEntity, ScheduledMessage } from '@/types';
import type { StudioPlannerTextPayload } from '@shared/bridge';
import { insertMessageText, limitMessageText } from '@/lib/messageLimits';
import { readSavedPlannerDrafts, SAVED_PLANNER_DRAFTS_UPDATED_EVENT, writeSavedPlannerDrafts, type SavedPlannerDraft } from '@/lib/plannerDraft';
import { mergeRichTextEntities } from '@/lib/richText';
import { load, save } from '@/lib/storage';
import { ChatPicker } from '@/components/ChatPicker';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';
import './QuickPlannerPage.css';

type QuickPlannerMode = 'send' | 'schedule' | 'draft';
type ReminderType = 'task' | 'meeting' | 'reminder' | 'event' | 'idea';

const plannerModes: Array<{ id: QuickPlannerMode; label: string; icon: typeof Send }> = [
  { id: 'send', label: 'Send now', icon: Send },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'draft', label: 'Draft', icon: FileText },
];

const scheduleQuickOptions = [
  { group: 'now', label: 'Сейчас', ariaLabel: 'Сейчас', minutes: 0 },
  { group: 'time', label: '+30 мин', ariaLabel: 'Через 30 минут', minutes: 30 },
  { group: 'time', label: '+1 ч', ariaLabel: 'Через 1 час', minutes: 60 },
  { group: 'days', label: '+1 день', ariaLabel: 'Через 1 день', days: 1 },
  { group: 'days', label: '+1 неделя', ariaLabel: 'Через 1 неделю', days: 7 },
];

const reminderTypes: Array<{ id: ReminderType; label: string; icon: typeof CheckCircle2 }> = [
  { id: 'task', label: 'Task', icon: CheckCircle2 },
  { id: 'meeting', label: 'Meeting', icon: Clock },
  { id: 'reminder', label: 'Reminder', icon: Bell },
  { id: 'event', label: 'Event', icon: CalendarDays },
  { id: 'idea', label: 'Idea', icon: Lightbulb },
];

function sortPlannerDraftsByPinned(drafts: SavedPlannerDraft[]) {
  return [
    ...drafts.filter((draft) => draft.pinned),
    ...drafts.filter((draft) => !draft.pinned),
  ];
}

const plannerMotivations = [
  'Keep growing, keep glowing.',
  'Be patient with your progress.',
  'Make your ordinary extraordinary.',
  'Focus on what matters.',
  'Choose what moves you forward.',
];
let lastPlannerMotivation: string | null = null;

function choosePlannerMotivation() {
  const choices = plannerMotivations.filter((phrase) => phrase !== lastPlannerMotivation);
  return choices[Math.floor(Math.random() * choices.length)] ?? plannerMotivations[0];
}

function readSavedReminderType(): ReminderType | null {
  const savedType = load<unknown>(REMINDER_TYPE_STORAGE_KEY, null);
  return reminderTypes.some(({ id }) => id === savedType) ? savedType as ReminderType : null;
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
  isSending,
  isScheduling,
  onSendNow,
  onSchedule,
  onSaveDraft,
  onOpenInStudio,
  notification,
  closeNotification,
}: QuickPlannerPageProps) {
  const { currentSection, openStudio, openPosts, openSettings } = useContext(QuickPlannerNavigationContext);
  const [sidebarMotivation] = useState(choosePlannerMotivation);
  const [publishMode, setPublishMode] = useState<QuickPlannerMode>('send');
  const [reminderType, setReminderType] = useState<ReminderType | null>(readSavedReminderType);
  const [savedPlannerDrafts, setSavedPlannerDrafts] = useState<SavedPlannerDraft[]>(readSavedPlannerDrafts);
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
    const syncSavedPlannerDrafts = () => {
      const nextDrafts = readSavedPlannerDrafts();
      const availableDraftIds = new Set(nextDrafts.map(({ id }) => id));
      setSavedPlannerDrafts(nextDrafts);
      setSelectedDraftIds((current) => current.filter((id) => availableDraftIds.has(id)));
    };
    window.addEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, syncSavedPlannerDrafts);
    return () => window.removeEventListener(SAVED_PLANNER_DRAFTS_UPDATED_EVENT, syncSavedPlannerDrafts);
  }, []);
  const [scheduleDate, scheduleTime] = scheduleDateTime.split('T');
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
  const [sendingNow, setSendingNow] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<'sent' | 'scheduled' | 'saved' | 'failed' | null>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const [blockedWarning, setBlockedWarning] = useState<string | null>(null);
  const blockedWarningTimeoutRef = useRef<number | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [permissionWarningPulse, setPermissionWarningPulse] = useState(false);
  const [draftScrollbar, setDraftScrollbar] = useState({ height: 0, offset: 0, scrollable: false });
  const plannerEditorRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftListRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftScrollbarRef = useRef<HTMLDivElement | null>(null);
  const plannerDraftScrollDragRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
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
      : actionFeedback === 'saved'
        ? 'Draft saved'
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
      : actionFeedback === 'saved'
        ? { message: 'Draft saved.', type: 'success' as const }
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

  return (
    <section className="quick-planner-page" aria-labelledby="quick-planner-title" data-publish-mode={publishMode}>
      <header className="quick-planner-header">
          <div className="quick-planner-heading">
            <Zap size={19} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <h1 id="quick-planner-title">Quick Planner</h1>
            </div>
          </div>
      </header>

      <div className="quick-planner-layout">
          <aside className="quick-planner-sidebar">
            <nav className="quick-planner-nav" aria-label="Workspace navigation">
              <button
                className={`quick-planner-nav-item${currentSection === 'studio' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'studio' ? 'page' : undefined}
                onClick={openStudio}
              >
                <FileText size={16} aria-hidden="true" />
                <span>Studio</span>
              </button>
              <button
                className={`quick-planner-nav-item${currentSection === 'posts' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'posts' ? 'page' : undefined}
                onClick={openPosts}
              >
                <History size={16} aria-hidden="true" />
                <span>Posts</span>
              </button>
              <button
                className={`quick-planner-nav-item${currentSection === 'settings' ? ' is-active' : ''}`}
                type="button"
                aria-current={currentSection === 'settings' ? 'page' : undefined}
                onClick={openSettings}
              >
                <Settings size={16} aria-hidden="true" />
                <span>Settings</span>
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
                <span className="quick-planner-section-label">Create reminder</span>
              </div>
              <div className="quick-planner-heading-actions">
                <div className="quick-planner-mode-switch" role="group" aria-label="Action mode">
                  <span className="quick-planner-mode-caption">Current action</span>
                  {plannerModes.map(({ id, label, icon: ModeIcon }) => (
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
                  <span className="quick-planner-mode-caption">Send to</span>
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
                  {emojiPickerOpen && (
                    <div id="quick-planner-emoji-picker" className="quick-planner-emoji-picker" role="group" aria-label="Choose emoji">
                      {plannerEmojis.map((emoji) => (
                        <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>
                      ))}
                    </div>
                  )}
                  <button type="button" aria-label="Add attachment" title="Attachment" onClick={() => fileInputRef.current?.click()}><Paperclip size={18} aria-hidden="true" /></button>
                  {publishMode === 'draft' && (
                    <div className={`quick-planner-type-controls ${isReminderTypePanelOpen ? 'is-open' : ''}`}>
                      {isReminderTypePanelOpen && (
                        <div id="quick-planner-reminder-types" className="quick-planner-reminder-types" role="group" aria-label="Tags">
                          <button
                            type="button"
                            onClick={() => {
                              updateReminderType(null);
                              setIsReminderTypePanelOpen(false);
                            }}
                          >
                            <span>None</span>
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
                        aria-label={isReminderTypePanelOpen ? 'Close tag choices' : selectedReminderType ? `Change tag: ${selectedReminderType.label}` : 'Add tag'}
                        aria-expanded={isReminderTypePanelOpen}
                        aria-controls="quick-planner-reminder-types"
                        title={isReminderTypePanelOpen ? 'Close tag choices' : selectedReminderType ? 'Change tag' : 'Add tag'}
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
                            <span>Add tag</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {publishMode === 'schedule' && (
                    <div className="quick-planner-schedule-controls" role="group" aria-label="Schedule date and time">
                      <label className="quick-planner-schedule-date" title="Schedule date">
                        <CalendarDays size={15} aria-hidden="true" />
                        <input
                          aria-label="Schedule date"
                          type="date"
                          min={minimumScheduleDateTime.slice(0, 10)}
                          value={scheduleDate || ''}
                          onChange={(event) => setScheduleDateTimeWithinRange(event.target.value, scheduleTime || '12:00')}
                        />
                      </label>
                      <label className="quick-planner-schedule-clock" title="Schedule time">
                        <Clock size={15} aria-hidden="true" />
                        <input
                          aria-label="Schedule time"
                          type="time"
                          min={scheduleDate === minimumScheduleDateTime.slice(0, 10) ? minimumScheduleDateTime.slice(11, 16) : undefined}
                          value={scheduleTime || ''}
                          onChange={(event) => setScheduleDateTimeWithinRange(scheduleDate || minimumScheduleDateTime.slice(0, 10), event.target.value)}
                        />
                      </label>
                    </div>
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
            <div className="quick-planner-upcoming">
            <div className="quick-planner-upcoming-heading">
              <span className="quick-planner-section-label"><Zap size={13} strokeWidth={2.3} aria-hidden="true" />{savedPlannerDrafts.length >= 2 ? 'Drafts' : 'Draft'}</span>
              <span>Thoughts &amp; Studio{savedPlannerDrafts.length > 0 ? ` · ${savedPlannerDrafts.length}` : ''}</span>
            </div>
            <div className="quick-planner-reminder-scroll-area">
              <div
                id="quick-planner-draft-list"
                ref={plannerDraftListRef}
                className="quick-planner-reminder-list"
                role="group"
                aria-label="Quick Planner drafts"
                onScroll={updateDraftScrollbar}
              >
              {savedPlannerDrafts.length > 0 ? savedPlannerDrafts.map((draft, index) => {
                const draftReminderType = reminderTypes.find(({ id }) => id === draft.reminderType);
                const DraftReminderIcon = draftReminderType?.icon;
                const draftSummary = draft.message.trim()
                  ? draft.message
                  : draft.attachments.length === 1
                    ? 'Draft with 1 attachment'
                    : `Draft with ${draft.attachments.length} attachments`;
                const savedDate = draft.savedAt ? new Date(draft.savedAt) : null;
                const savedLabel = savedDate && !Number.isNaN(savedDate.getTime())
                  ? savedDate.toLocaleString()
                  : '';

                return (
                  <article
                    className={`quick-planner-draft${selectedDraftIds.includes(draft.id) ? ' is-selected' : ''}`}
                    key={draft.id}
                    onClick={(event) => {
                      const target = event.target;
                      if (target instanceof Element && target.closest('button, input, label')) return;
                      toggleDraftSelection(draft.id);
                    }}
                  >
                    <div className="quick-planner-draft-heading">
                      <label className="quick-planner-draft-select">
                        <input
                          type="checkbox"
                          value={draft.id}
                          checked={selectedDraftIds.includes(draft.id)}
                          title={selectedDraftIds.includes(draft.id) ? 'Deselect this draft' : 'Select this draft'}
                          onChange={() => toggleDraftSelection(draft.id)}
                          aria-label={`${selectedDraftIds.includes(draft.id) ? 'Deselect' : 'Select'} draft ${draftSummary}`}
                        />
                        <strong>{savedPlannerDrafts.length - index === 1 ? 'Saved draft' : `Saved draft ${savedPlannerDrafts.length - index}`}</strong>
                      </label>
                      <div className="quick-planner-draft-actions">
                        <button
                          type="button"
                          className={`quick-planner-draft-pin${draft.pinned ? ' is-pinned' : ''}`}
                          onClick={() => togglePlannerDraftPin(draft.id)}
                          aria-label={`${draft.pinned ? 'Unpin' : 'Pin'} draft ${draftSummary}`}
                          aria-pressed={Boolean(draft.pinned)}
                          title={draft.pinned ? 'Unpin draft' : 'Pin draft to top'}
                        >
                          <Pin size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="quick-planner-draft-delete"
                          onClick={() => deletePlannerDraft(draft.id)}
                          aria-label={`Delete draft ${draftSummary}`}
                          title="Delete draft"
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
              }) : <p className="quick-planner-empty">No saved Quick Planner drafts.</p>}
              </div>
              <div
                ref={plannerDraftScrollbarRef}
                className={`quick-planner-draft-scrollbar${draftScrollbar.scrollable ? ' is-scrollable' : ''}`}
                aria-hidden={!draftScrollbar.scrollable}
              >
                <div
                  className="quick-planner-draft-scrollbar-thumb"
                  role="scrollbar"
                  aria-label="Scroll drafts"
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
                  Select a draft or create a note
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
                title={`Open ${selectedDrafts.length} selected ${selectedDrafts.length === 1 ? 'draft' : 'drafts'} in Studio`}
                aria-label={`Open ${selectedDrafts.length} selected ${selectedDrafts.length === 1 ? 'draft' : 'drafts'} in Studio`}
              >
                <ArrowUpRight size={18} />
                <span>Open drafts in Studio</span>
                <span className="quick-planner-open-studio-count" aria-hidden="true">{selectedDrafts.length}</span>
              </button>
            </div>
          </aside>
      </div>
    </section>
  );
}