import { type ChangeEvent, type CSSProperties, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Chat } from '@/types';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eraser,
  FileText,
  Paperclip,
  Search,
  Send,
  Smile,
  Sparkles,
  X,
} from 'lucide-react';
import {
  EDITOR_APPEARANCE_UPDATED_EVENT,
  getEditorAppearanceCssTokens,
  readEditorAppearancePreferences,
  resolveEditorAppearanceColor,
} from '@shared/editorAppearance';
import type { StudioPlannerTextPayload } from '@shared/bridge';
import { createPortal } from 'react-dom';
import { ChatAvatar } from '../studio/components/ChatAvatar';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';
import './QuickPlannerMockup.css';

const mockupModes = [
  { label: 'Send now', icon: Send },
  { label: 'Schedule', icon: CalendarDays },
  { label: 'Draft', icon: FileText },
];

const mockupNotes = [
  { number: '01', title: 'Capture ideas quickly', text: 'Save the thought before you forget it.' },
  { number: '02', title: 'Turn ideas into action', text: 'Create a reminder to bring your idea to life.' },
  { number: '03', title: 'Continue in Studio', text: 'Refine your message in the full editor.' },
];

type MockupFeedback = {
  message: string;
  tone: 'error' | 'warning' | 'success' | 'info';
};

type MockupChat = {
  id: string;
  name: string;
  type: string;
  avatarDataUrl?: string;
  sourceChat?: Chat;
};

type QuickPlannerMockupProps = {
  chats?: Chat[];
  selectedChat?: Chat | null;
  onSelectChat?: (chat: Chat | null) => void;
  onRemoveChat?: (chat: Chat) => void;
  onOpenInStudio?: (payload: StudioPlannerTextPayload) => void;
  onSendNow?: (chat: Chat, message: string) => Promise<boolean>;
  onSchedule?: (request: { chatId: string; message: string; date: string; time: string }) => Promise<void>;
  onSaveDraft?: (draft: { message: string; attachments: string[] }) => boolean;
};

const mockupChats: MockupChat[] = [
  { id: 'saved', name: 'Saved Messages', type: 'Personal notes' },
  { id: 'studio-team', name: 'XMSGi Studio', type: 'Group chat' },
  { id: 'design-updates', name: 'Design updates', type: 'Channel' },
  { id: 'mira', name: 'Mira', type: 'Private chat' },
  { id: 'release-room', name: 'Release room', type: 'Group chat' },
  { id: 'product-news', name: 'Product news', type: 'Channel' },
  { id: 'alex', name: 'Alex', type: 'Private chat' },
  { id: 'studio-feedback', name: 'Studio feedback', type: 'Group chat' },
  { id: 'weekly-digest', name: 'Weekly digest', type: 'Channel' },
  { id: 'nina', name: 'Nina', type: 'Private chat' },
  { id: 'launch-planning', name: 'Launch planning', type: 'Group chat' },
  { id: 'telegram-tips', name: 'Telegram tips', type: 'Channel' },
  { id: 'design-review', name: 'Design review', type: 'Group chat' },
  { id: 'sam', name: 'Sam', type: 'Private chat' },
  { id: 'community', name: 'Community updates', type: 'Channel' },
];

function getMockupChatInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase();
}

const mockupEmojiCategories = [
  { id: 'faces', label: 'Faces', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '🙃', '😉', '😊', '😍', '🥰', '😘', '😎', '🥳', '🤔'] },
  { id: 'hands', label: 'Hands', emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👍', '👎', '👏', '🙌'] },
  { id: 'hearts', label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '🩷', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘'] },
  { id: 'nature', label: 'Nature', emojis: ['🔥', '✨', '⭐', '🌟', '💫', '🌈', '☀️', '🌙', '🌸', '🌹', '🌻', '🌼', '🍀', '🌿', '🌊', '⚡', '❄️', '☔'] },
  { id: 'food', label: 'Food', emojis: ['🍎', '🍓', '🍒', '🍉', '🍇', '🍊', '🍋', '🍌', '🍍', '🥑', '🍕', '🍔', '🍟', '🍰', '🎂', '🍩', '☕', '🧋'] },
  { id: 'fun', label: 'Fun', emojis: ['🎉', '🎈', '🎁', '🏆', '⚽', '🏀', '🎸', '🎧', '🚀', '✈️', '💡', '📌', '💻', '📷', '💎', '🎨', '🎯', '🛠️'] },
];
const mockupEmojiNames: Record<string, string> = {
  '😀': 'grinning face smile happy', '😃': 'smiley face happy', '😄': 'smiling face happy', '😁': 'grin smile happy',
  '😆': 'laughing face happy', '😅': 'sweat smile nervous', '😂': 'joy tears laugh', '🤣': 'rolling floor laugh',
  '🙂': 'slightly smiling face', '🙃': 'upside down smile', '😉': 'wink', '😊': 'blush smile', '😍': 'heart eyes love',
  '🥰': 'smiling hearts love', '😘': 'kiss love', '😎': 'cool sunglasses', '🥳': 'party celebration', '🤔': 'thinking face',
  '👋': 'wave hello goodbye', '👌': 'ok hand', '🤌': 'pinched fingers', '✌️': 'victory peace', '🤞': 'crossed fingers luck',
  '🤟': 'love you hand', '🤘': 'rock on hand', '👍': 'thumbs up like yes', '👎': 'thumbs down dislike no', '👏': 'clap applause',
  '🙌': 'raised hands celebrate', '❤️': 'red heart love', '🧡': 'orange heart love', '💛': 'yellow heart love',
  '💚': 'green heart love', '💙': 'blue heart love', '💜': 'purple heart love', '🖤': 'black heart love',
  '🤍': 'white heart love', '🤎': 'brown heart love', '🩷': 'pink heart love', '💔': 'broken heart heartbreak',
  '💕': 'two hearts love', '💞': 'revolving hearts love', '💓': 'beating heart love', '💗': 'growing heart love',
  '💖': 'sparkling heart love', '💘': 'heart arrow cupid love', '🔥': 'fire flame hot', '✨': 'sparkles shine magic',
  '⭐': 'star favorite', '🌟': 'glowing star', '💫': 'dizzy star', '🌈': 'rainbow', '☀️': 'sun sunny', '🌙': 'moon night',
  '🌸': 'cherry blossom flower', '🌹': 'rose flower love', '🌻': 'sunflower', '🍀': 'four leaf clover luck',
  '🌊': 'water wave ocean', '⚡': 'lightning bolt energy', '❄️': 'snowflake cold winter', '☔': 'umbrella rain',
  '🍎': 'red apple fruit', '🍓': 'strawberry fruit', '🍒': 'cherries fruit', '🍉': 'watermelon fruit',
  '🍇': 'grapes fruit', '🍊': 'orange fruit', '🍋': 'lemon fruit', '🍌': 'banana fruit', '🍍': 'pineapple fruit',
  '🥑': 'avocado fruit', '🍕': 'pizza food', '🍔': 'burger food', '🍟': 'fries food', '🍰': 'cake dessert',
  '🎂': 'birthday cake', '🍩': 'donut dessert', '☕': 'coffee drink', '🧋': 'bubble tea drink', '🎉': 'party popper celebration',
  '🎈': 'balloon party', '🎁': 'gift present', '🏆': 'trophy winner', '⚽': 'soccer football ball', '🏀': 'basketball ball',
  '🎸': 'guitar music', '🎧': 'headphones music', '🚀': 'rocket space', '✈️': 'airplane travel', '💡': 'light bulb idea',
  '💻': 'laptop computer', '📷': 'camera photo', '💎': 'gem diamond', '🎨': 'art palette', '🎯': 'target bullseye',
  '🛠️': 'tools hammer wrench',
};
const mockupEmojiRussianNames: Record<string, string> = {
  '😀': 'улыбка радость смайлик счастливый', '😃': 'улыбка радостный', '😄': 'улыбается радость', '😁': 'широкая улыбка оскал',
  '😆': 'смеется смех', '😅': 'неловкость пот улыбка', '😂': 'смех слезы радость', '🤣': 'хохот катается смех',
  '🙂': 'улыбка', '🙃': 'перевернутый смайлик', '😉': 'подмигивание', '😊': 'улыбка румянец', '😍': 'влюбленный глаза сердечки',
  '🥰': 'любовь улыбка сердечки', '😘': 'поцелуй губы', '😎': 'очки круто', '🥳': 'праздник вечеринка', '🤔': 'думает размышляет',
  '👋': 'привет пока махать', '🤚': 'ладонь рука', '✋': 'стоп ладонь рука', '🖖': 'вулкан приветствие', '👌': 'ок отлично хорошо',
  '🤌': 'пальцы жест', '🤏': 'мало щепотка', '✌️': 'победа мир', '🤞': 'удача скрещенные пальцы', '🤟': 'люблю жест',
  '🤘': 'рок рога', '🤙': 'позвони мне', '👈': 'влево указатель', '👉': 'вправо указатель', '👍': 'лайк хорошо да палец вверх',
  '👎': 'дизлайк плохо нет палец вниз', '👏': 'аплодисменты хлопать', '🙌': 'руки вверх ура',
  '❤️': 'сердце красное любовь', '🧡': 'сердце оранжевое любовь', '💛': 'сердце желтое любовь', '💚': 'сердце зеленое любовь',
  '💙': 'сердце синее голубое любовь', '💜': 'сердце фиолетовое любовь', '🖤': 'сердце черное любовь', '🤍': 'сердце белое любовь',
  '🤎': 'сердце коричневое любовь', '🩷': 'сердце розовое любовь', '💔': 'разбитое сердце расставание', '❣️': 'сердце восклицание',
  '💕': 'два сердца любовь', '💞': 'вращающиеся сердца любовь', '💓': 'бьющееся сердце любовь', '💗': 'растущее сердце любовь',
  '💖': 'сверкающее сердце любовь', '💘': 'сердце стрела купидон любовь', '🔥': 'огонь пламя жарко', '✨': 'искры блеск магия',
  '⭐': 'звезда избранное', '🌟': 'сверкающая звезда', '💫': 'падающая звезда головокружение', '🌈': 'радуга', '☀️': 'солнце солнечно',
  '🌙': 'луна ночь', '🌸': 'цветок сакура', '🌹': 'роза цветок любовь', '🌻': 'подсолнух', '🌼': 'цветок ромашка',
  '🍀': 'клевер удача', '🌿': 'трава зелень', '🌊': 'волна море океан вода', '⚡': 'молния энергия', '❄️': 'снежинка зима холод',
  '☔': 'зонт дождь', '🍎': 'яблоко красное фрукт', '🍓': 'клубника ягода', '🍒': 'вишня ягоды', '🍉': 'арбуз фрукт',
  '🍇': 'виноград', '🍊': 'апельсин фрукт', '🍋': 'лимон фрукт', '🍌': 'банан фрукт', '🍍': 'ананас фрукт',
  '🥑': 'авокадо фрукт', '🍕': 'пицца еда', '🍔': 'бургер гамбургер еда', '🍟': 'картошка фри еда', '🍰': 'торт десерт',
  '🎂': 'торт день рождения', '🍩': 'пончик десерт', '☕': 'кофе напиток', '🧋': 'чай бабл ти напиток', '🎉': 'конфетти праздник вечеринка',
  '🎈': 'шарик воздушный вечеринка', '🎁': 'подарок', '🏆': 'кубок победа', '⚽': 'футбол мяч', '🏀': 'баскетбол мяч',
  '🎸': 'гитара музыка', '🎧': 'наушники музыка', '🚀': 'ракета космос', '✈️': 'самолет путешествие', '💡': 'лампочка идея',
  '📌': 'кнопка булавка', '💻': 'ноутбук компьютер', '📷': 'камера фото', '💎': 'алмаз бриллиант', '🎨': 'палитра искусство',
  '🎯': 'мишень цель', '🛠️': 'инструменты молоток ключ',
};
const allMockupEmojiOptions = mockupEmojiCategories.flatMap((category) => category.emojis.map((emoji) => ({
  emoji,
  categoryId: category.id,
  categoryLabel: category.label,
  name: mockupEmojiNames[emoji] ?? `${category.label} emoji`,
  searchText: `${mockupEmojiNames[emoji] ?? ''} ${mockupEmojiRussianNames[emoji] ?? ''} ${category.label}`.toLocaleLowerCase(),
})));
const recentEmojiStorageKey = 'xmsgi-quick-planner-recent-emojis';
const knownMockupEmojis = new Set(mockupEmojiCategories.flatMap((category) => category.emojis));

function readRecentMockupEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(recentEmojiStorageKey) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((emoji): emoji is string => typeof emoji === 'string' && knownMockupEmojis.has(emoji)).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}
const mockupMessageEffects: Array<{ id: string | null; label: string; emoticon: string }> = [
  { id: 'hearts', label: 'Hearts', emoticon: '❤️' },
  { id: 'sparkles', label: 'Sparkles', emoticon: '✨' },
  { id: 'confetti', label: 'Confetti', emoticon: '🎉' },
  { id: null, label: 'No effect', emoticon: '−' },
  { id: 'thumbs-up', label: 'Thumbs up', emoticon: '👍' },
  { id: 'fire', label: 'Fire', emoticon: '🔥' },
];
const scheduleTimeOptions = Array.from({ length: 96 }, (_, index) => (
  `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`
));
const mockupFeedbackDurationMs = {
  error: 8000,
  warning: 5000,
  success: 3360,
  info: 3360,
} as const;

function toDateInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  return year === new Date().getFullYear() ? label : `${label} '${String(year).slice(-2)}`;
}

function formatTimeValue(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function parseScheduleTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})[:.](\d{1,2})$/)
    ?? value.trim().replace(/\D/g, '').match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toLocalDateTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatTimeZoneOffset(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteOffset / 60);
  const minutes = absoluteOffset % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

function getNextScheduleDateTime(now: Date) {
  const nextAvailable = new Date(now);
  nextAvailable.setMinutes(nextAvailable.getMinutes() + 1, 0, 0);
  return {
    date: toDateInputValue(nextAvailable),
    time: formatTimeValue(nextAvailable),
  };
}

export function QuickPlannerMockup({
  chats = [],
  selectedChat: activeChat = null,
  onSelectChat,
  onRemoveChat,
  onOpenInStudio,
  onSendNow,
  onSchedule,
  onSaveDraft,
}: QuickPlannerMockupProps) {
  const [selectedMode, setSelectedMode] = useState('Schedule');
  const [message, setMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [initialScheduleDateTime] = useState(() => getNextScheduleDateTime(currentTime));
  const [selectedDate, setSelectedDate] = useState(initialScheduleDateTime.date);
  const [selectedTime, setSelectedTime] = useState(initialScheduleDateTime.time);
  const [activeSchedulePicker, setActiveSchedulePicker] = useState<'date' | 'time' | null>(null);
  const [scheduleTimeDraft, setScheduleTimeDraft] = useState<string | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [schedulePickerPosition, setSchedulePickerPosition] = useState({ top: 8, left: 8, maxHeight: 276 });
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiModifierHeld, setEmojiModifierHeld] = useState(false);
  const [emojiCategoryId, setEmojiCategoryId] = useState('faces');
  const [emojiSearchQuery, setEmojiSearchQuery] = useState('');
  const [emojiActiveIndex, setEmojiActiveIndex] = useState(0);
  const [emojiCommandRange, setEmojiCommandRange] = useState<{ start: number; end: number } | null>(null);
  const [recentEmojis, setRecentEmojis] = useState(readRecentMockupEmojis);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [editorAppearance, setEditorAppearance] = useState(readEditorAppearancePreferences);
  const [actionFeedback, setActionFeedback] = useState<MockupFeedback | null>(null);
  const [actionFeedbackInstance, setActionFeedbackInstance] = useState(0);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [selectedMockupChatId, setSelectedMockupChatId] = useState(mockupChats[0].id);
  const [removedMockupChatIds, setRemovedMockupChatIds] = useState<string[]>([]);
  const isScheduleMode = selectedMode === 'Schedule';
  const isDraftMode = selectedMode === 'Draft';
  const selectedMockupEffect = mockupMessageEffects.find((effect) => effect.id !== null && effect.id === selectedEffectId) ?? null;
  const selectedEmojiCategory = mockupEmojiCategories.find((category) => category.id === emojiCategoryId) ?? mockupEmojiCategories[0];
  const normalizedEmojiSearchQuery = emojiSearchQuery.trim().toLocaleLowerCase();
  const visibleEmojiOptions = normalizedEmojiSearchQuery
    ? allMockupEmojiOptions
      .filter((option) => option.searchText.includes(normalizedEmojiSearchQuery))
      .sort((left, right) => {
        const leftHasExactWord = left.name.split(/\s+/).includes(normalizedEmojiSearchQuery);
        const rightHasExactWord = right.name.split(/\s+/).includes(normalizedEmojiSearchQuery);
        return Number(rightHasExactWord) - Number(leftHasExactWord);
      })
    : emojiCommandRange
      ? allMockupEmojiOptions
      : allMockupEmojiOptions.filter((option) => option.categoryId === emojiCategoryId);
  const appearanceMode = selectedMode === 'Send now' ? 'send' : isDraftMode ? 'draft' : 'schedule';
  const mockupAccent = resolveEditorAppearanceColor(editorAppearance, appearanceMode);
  const mockupAccentRgb = getEditorAppearanceCssTokens(editorAppearance, appearanceMode)['--editor-outline'];
  const timeZoneLabel = formatTimeZoneOffset(toLocalDateTime(selectedDate, selectedTime));
  const minimumScheduleDate = getNextScheduleDateTime(currentTime);
  const minimumScheduleDateTime = toLocalDateTime(minimumScheduleDate.date, minimumScheduleDate.time);
  const minimumScheduleDateValue = toDateInputValue(minimumScheduleDateTime);
  const minimumScheduleTimeValue = formatTimeValue(minimumScheduleDateTime);
  const calendarYear = calendarCursor.getFullYear();
  const calendarMonth = calendarCursor.getMonth();
  const calendarFirstWeekdayOffset = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDayCount = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarCursor);
  const calendarMonthKey = calendarYear * 12 + calendarMonth;
  const minimumMonthKey = Number(minimumScheduleDateValue.slice(0, 4)) * 12 + Number(minimumScheduleDateValue.slice(5, 7)) - 1;
  const todayScheduleDateValue = toDateInputValue(new Date());
  const SubmitIcon = selectedMode === 'Send now' ? Send : selectedMode === 'Draft' ? FileText : CalendarDays;
  const submitLabel = selectedMode === 'Send now' ? 'Send now' : selectedMode === 'Draft' ? 'Save draft' : 'Schedule post';
  const { openStudio, openPosts } = useContext(QuickPlannerNavigationContext);
  const chatPickerRef = useRef<HTMLDivElement>(null);
  const toolsRowRef = useRef<HTMLDivElement>(null);
  const effectsToolRef = useRef<HTMLDivElement>(null);
  const scheduleRowRef = useRef<HTMLDivElement>(null);
  const scheduleDateTriggerRef = useRef<HTMLButtonElement>(null);
  const scheduleTimeTriggerRef = useRef<HTMLButtonElement>(null);
  const scheduleDatePickerRef = useRef<HTMLDivElement>(null);
  const scheduleTimePickerRef = useRef<HTMLDivElement>(null);
  const chatTriggerRef = useRef<HTMLButtonElement>(null);
  const chatSearchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const workbenchRef = useRef<HTMLElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const emojiReleaseCloseTimeoutRef = useRef<number | null>(null);
  const emojiSelectionWaitingForReleaseRef = useRef(false);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    const workbench = workbenchRef.current;
    if (!heading || !workbench) return undefined;

    const updateHeadingWidth = () => {
      const width = Number.parseFloat(window.getComputedStyle(heading).width);
      if (Number.isFinite(width)) workbench.style.setProperty('--mockup-heading-width', `${width}px`);
    };
    updateHeadingWidth();

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeadingWidth);
    resizeObserver?.observe(heading);
    return () => {
      resizeObserver?.disconnect();
      workbench.style.removeProperty('--mockup-heading-width');
    };
  }, []);
  const sourceChats = activeChat && !chats.some((chat) => chat.id === activeChat.id)
    ? [activeChat, ...chats]
    : chats;
  const pickerChats: MockupChat[] = sourceChats.length > 0
    ? sourceChats.map((chat) => ({
      id: chat.id,
      name: chat.name,
      type: chat.type === 'private' ? 'Private chat'
        : chat.type === 'group' ? 'Group chat'
          : chat.type === 'supergroup' ? 'Supergroup'
            : chat.type === 'channel' ? 'Channel' : 'Chat',
      avatarDataUrl: chat.avatarDataUrl,
      sourceChat: chat,
    }))
    : mockupChats;
  const availablePickerChats = pickerChats.filter((chat) => !removedMockupChatIds.includes(chat.id));
  const selectedPickerChat = (activeChat && availablePickerChats.find((chat) => chat.id === activeChat.id))
    ?? availablePickerChats.find((chat) => chat.id === selectedMockupChatId)
    ?? availablePickerChats[0]
    ?? null;
  const filteredChats = availablePickerChats.filter((chat) => (
    `${chat.name} ${chat.type}`.toLowerCase().includes(chatQuery.trim().toLowerCase())
  ));

  const removePickerChat = (chat: MockupChat) => {
    if (chat.sourceChat && onRemoveChat) {
      onRemoveChat(chat.sourceChat);
      return;
    }

    setRemovedMockupChatIds((current) => current.includes(chat.id) ? current : [...current, chat.id]);
    if (chat.id === selectedMockupChatId || chat.id === activeChat?.id) {
      const nextChat = availablePickerChats.find((candidate) => candidate.id !== chat.id);
      setSelectedMockupChatId(nextChat?.id ?? '');
      onSelectChat?.(null);
    }
  };

  const setScheduleDateTimeWithinRange = (dateValue: string, timeValue: string) => {
    const candidate = toLocalDateTime(dateValue, timeValue);
    if (candidate.getTime() <= minimumScheduleDateTime.getTime()) {
      setSelectedDate(minimumScheduleDateValue);
      setSelectedTime(minimumScheduleTimeValue);
      return;
    }
    setSelectedDate(dateValue);
    setSelectedTime(timeValue);
  };

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

  const showActionFeedback = (message: string, tone: MockupFeedback['tone']) => {
    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current);
    }

    setActionFeedbackInstance((instance) => instance + 1);
    setActionFeedback({ message, tone });
    actionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setActionFeedback(null);
      actionFeedbackTimeoutRef.current = null;
    }, mockupFeedbackDurationMs[tone]);
  };

  const clearActionFeedback = () => {
    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current);
      actionFeedbackTimeoutRef.current = null;
    }
    setActionFeedback(null);
  };

  const toggleEffectPicker = () => {
    const nextOpen = !effectPickerOpen;
    setEffectPickerOpen(nextOpen);
    if (nextOpen) setEmojiPickerOpen(false);
  };

  useEffect(() => {
    if (!effectPickerOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!effectsToolRef.current?.contains(event.target as Node)) setEffectPickerOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEffectPickerOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [effectPickerOpen]);

  useEffect(() => () => {
    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current);
    }
  }, []);

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
    if (!chatPickerOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!chatPickerRef.current?.contains(event.target as Node)) {
        setChatPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChatPickerOpen(false);
        chatTriggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    chatSearchRef.current?.focus();

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [chatPickerOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!toolsRowRef.current?.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
        setEmojiModifierHeld(false);
        setEmojiSearchQuery('');
        setEmojiCommandRange(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') setEmojiModifierHeld(true);
      if (event.key === 'Escape') {
        if (emojiReleaseCloseTimeoutRef.current !== null) {
          window.clearTimeout(emojiReleaseCloseTimeoutRef.current);
          emojiReleaseCloseTimeoutRef.current = null;
        }
        emojiSelectionWaitingForReleaseRef.current = false;
        setEmojiModifierHeld(false);
        setEmojiPickerOpen(false);
        setEmojiSearchQuery('');
        setEmojiCommandRange(null);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') setEmojiModifierHeld(false);
      if ((event.key !== 'Control' && event.key !== 'Meta') || !emojiSelectionWaitingForReleaseRef.current) return;
      emojiSelectionWaitingForReleaseRef.current = false;
      if (emojiReleaseCloseTimeoutRef.current !== null) window.clearTimeout(emojiReleaseCloseTimeoutRef.current);
      emojiReleaseCloseTimeoutRef.current = window.setTimeout(() => {
        emojiReleaseCloseTimeoutRef.current = null;
        setEmojiPickerOpen(false);
        setEmojiSearchQuery('');
        setEmojiCommandRange(null);
      }, 700);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      if (emojiReleaseCloseTimeoutRef.current !== null) {
        window.clearTimeout(emojiReleaseCloseTimeoutRef.current);
        emojiReleaseCloseTimeoutRef.current = null;
      }
      emojiSelectionWaitingForReleaseRef.current = false;
    };
  }, [emojiPickerOpen]);

  useEffect(() => {
    const handleEmojiShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== '.') return;
      event.preventDefault();
      setEffectPickerOpen(false);
      setEmojiPickerOpen(true);
      setEmojiSearchQuery('');
      setEmojiCommandRange(null);
      setEmojiActiveIndex(0);
    };

    document.addEventListener('keydown', handleEmojiShortcut);
    return () => document.removeEventListener('keydown', handleEmojiShortcut);
  }, []);

  useEffect(() => {
    if (!activeSchedulePicker) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !scheduleRowRef.current?.contains(target)
        && !scheduleDatePickerRef.current?.contains(target)
        && !scheduleTimePickerRef.current?.contains(target)
      ) {
        setActiveSchedulePicker(null);
        setScheduleTimeDraft(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveSchedulePicker(null);
        setScheduleTimeDraft(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeSchedulePicker]);

  useLayoutEffect(() => {
    if (!activeSchedulePicker) return undefined;

    const updateSchedulePickerPosition = () => {
      const anchor = activeSchedulePicker === 'date'
        ? scheduleDateTriggerRef.current
        : scheduleTimeTriggerRef.current;
      const picker = activeSchedulePicker === 'date'
        ? scheduleDatePickerRef.current
        : scheduleTimePickerRef.current;
      if (!anchor || !picker) return;

      const anchorBounds = anchor.getBoundingClientRect();
      const width = activeSchedulePicker === 'date' ? 246 : 172;
      const maxHeight = Math.max(80, Math.min(276, window.innerHeight - 16, anchorBounds.top - 16));
      const pickerHeight = Math.min(picker.getBoundingClientRect().height || maxHeight, maxHeight);
      const top = Math.max(8, anchorBounds.top - pickerHeight - 7);
      const left = Math.max(8, Math.min(anchorBounds.left, window.innerWidth - width - 8));
      setSchedulePickerPosition({ top, left, maxHeight });
    };

    updateSchedulePickerPosition();
    window.addEventListener('resize', updateSchedulePickerPosition);
    window.addEventListener('scroll', updateSchedulePickerPosition, true);
    return () => {
      window.removeEventListener('resize', updateSchedulePickerPosition);
      window.removeEventListener('scroll', updateSchedulePickerPosition, true);
    };
  }, [activeSchedulePicker, calendarMonth]);

  useEffect(() => {
    if (activeSchedulePicker !== 'time') return;
    const timePicker = scheduleTimePickerRef.current?.querySelector('.quick-planner-mockup-time-list');
    const selectedOption = timePicker?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    const firstAvailableOption = timePicker?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)');
    const targetOption = selectedOption && !selectedOption.disabled
      ? selectedOption
      : firstAvailableOption ?? selectedOption;
    targetOption?.scrollIntoView?.({ block: 'center' });
  }, [activeSchedulePicker, minimumScheduleTimeValue, selectedDate, selectedTime]);

  const insertEmoji = (emoji: string, keepPickerOpen = false, updateRecent = true) => {
    if (emojiReleaseCloseTimeoutRef.current !== null) {
      window.clearTimeout(emojiReleaseCloseTimeoutRef.current);
      emojiReleaseCloseTimeoutRef.current = null;
    }
    emojiSelectionWaitingForReleaseRef.current = keepPickerOpen;
    const textarea = messageInputRef.current;
    const start = emojiCommandRange?.start ?? textarea?.selectionStart ?? message.length;
    const end = emojiCommandRange?.end ?? textarea?.selectionEnd ?? message.length;
    const nextMessage = `${message.slice(0, start)}${emoji}${message.slice(end)}`.slice(0, 1023);
    setMessage(nextMessage);
    setEmojiCommandRange(null);
    if (!keepPickerOpen) setEmojiSearchQuery('');
    if (updateRecent) {
      setRecentEmojis((current) => {
        const nextRecentEmojis = [emoji, ...current.filter((recentEmoji) => recentEmoji !== emoji)].slice(0, 6);
        try {
          window.localStorage.setItem(recentEmojiStorageKey, JSON.stringify(nextRecentEmojis));
        } catch {
          // Keep this picker usable when storage is unavailable.
        }
        return nextRecentEmojis;
      });
    }
    setEmojiPickerOpen(keepPickerOpen);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = Math.min(start + emoji.length, nextMessage.length);
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const toggleEmojiPicker = () => {
    const nextOpen = !emojiPickerOpen;
    setEmojiPickerOpen(nextOpen);
    if (nextOpen) setEffectPickerOpen(false);
    if (!nextOpen) {
      setEmojiSearchQuery('');
      setEmojiCommandRange(null);
      setEmojiActiveIndex(0);
    }
  };

  const handleEmojiPickerKeyDown = (event: { key: string; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void }) => {
    if (!normalizedEmojiSearchQuery || visibleEmojiOptions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setEmojiActiveIndex((index) => (index + direction + visibleEmojiOptions.length) % visibleEmojiOptions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      insertEmoji(visibleEmojiOptions[emojiActiveIndex]?.emoji ?? visibleEmojiOptions[0].emoji, Boolean(event.ctrlKey || event.metaKey));
    }
  };

  const applyQuickTime = (preset: 'now' | '30min' | 'tomorrow') => {
    if (preset === 'now') {
      const nextAvailable = getNextScheduleDateTime(new Date());
      setSelectedDate(nextAvailable.date);
      setSelectedTime(nextAvailable.time);
      return;
    }

    const selectedDateTime = toLocalDateTime(selectedDate, selectedTime);

    if (preset === '30min') selectedDateTime.setMinutes(selectedDateTime.getMinutes() + 30);
    if (preset === 'tomorrow') selectedDateTime.setDate(selectedDateTime.getDate() + 1);

    setSelectedDate(toDateInputValue(selectedDateTime));
    setSelectedTime(formatTimeValue(selectedDateTime));
  };

  const handleMockSubmit = async () => {
    if (!message.trim()) {
      showActionFeedback('Write a message first.', 'warning');
      return;
    }
    if (
      isScheduleMode
      && toLocalDateTime(selectedDate, selectedTime).getTime() < minimumScheduleDateTime.getTime()
    ) {
      showActionFeedback('Choose a schedule time at least one minute from now.', 'warning');
      return;
    }
    if (isDraftMode) {
      if (onSaveDraft) {
        if (!onSaveDraft({ message, attachments })) {
          showActionFeedback('Could not save draft to Posts.', 'error');
          return;
        }
        showActionFeedback('Draft saved to Posts.', 'success');
        setMessage('');
        setAttachments([]);
        openPosts('drafts');
        return;
      }
      showActionFeedback('Draft saved in preview.', 'success');
    } else if (selectedMode === 'Send now') {
      if (onSendNow) {
        const chat = selectedPickerChat?.sourceChat;
        if (!chat) {
          showActionFeedback('Select a connected chat first.', 'warning');
          return;
        }
        try {
          const sent = await onSendNow(chat, message);
          if (!sent) {
            showActionFeedback('Message was not sent. Check Posts for details.', 'error');
            return;
          }
          showActionFeedback('Message sent and added to Posts history.', 'success');
          setMessage('');
          setAttachments([]);
          setSelectedEffectId(null);
          openPosts('sent');
        } catch {
          showActionFeedback('Message could not be sent. Check Posts for details.', 'error');
        }
        return;
      }
      showActionFeedback('Preview only. Nothing was sent.', 'warning');
    } else {
      if (onSchedule) {
        const chat = selectedPickerChat?.sourceChat;
        if (!chat) {
          showActionFeedback('Select a connected chat first.', 'warning');
          return;
        }
        try {
          await onSchedule({ chatId: chat.id, message, date: selectedDate, time: selectedTime });
          showActionFeedback('Schedule request sent to Posts.', 'success');
          setMessage('');
          setAttachments([]);
          setSelectedEffectId(null);
          openPosts('scheduled');
        } catch {
          showActionFeedback('Message could not be scheduled. Check Posts for details.', 'error');
        }
        return;
      }
      showActionFeedback(`Schedule preview: ${formatDateLabel(selectedDate)} at ${selectedTime}.`, 'info');
    }
  };

  const handleOpenInStudio = () => {
    if (!message.trim()) {
      showActionFeedback('Write text before continuing to Studio.', 'warning');
      return;
    }
    if (onOpenInStudio) {
      onOpenInStudio({ text: message, attachments: [], entities: [] });
      return;
    }
    openStudio();
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    if (selectedFiles.length > 0) {
      setAttachments((current) => [...current, ...selectedFiles.map((file) => file.name)]);
      showActionFeedback('Files added to this local preview.', 'info');
    }
    event.currentTarget.value = '';
  };

  return (
    <main
      className="quick-planner-mockup"
      aria-labelledby="quick-planner-mockup-title"
      style={{ '--mockup-accent': mockupAccent, '--mockup-accent-rgb': mockupAccentRgb } as CSSProperties}
    >
      <div className="quick-planner-mockup-inner">
        <header className="quick-planner-mockup-heading">
          <div>
            <h1 ref={headingRef} id="quick-planner-mockup-title">New message</h1>
          </div>
        </header>

        <div className="quick-planner-mockup-layout">
          <section ref={workbenchRef} className="quick-planner-mockup-workbench" aria-label="Quick Planner visual mockup">
            <div className="quick-planner-mockup-toolbar">
              <div className="quick-planner-mockup-destination" ref={chatPickerRef}>
                <span className="quick-planner-mockup-label">SEND TO</span>
                <button
                  ref={chatTriggerRef}
                  className={`quick-planner-mockup-chat${chatPickerOpen ? ' is-open' : ''}`}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={chatPickerOpen}
                  onClick={() => setChatPickerOpen((open) => !open)}
                >
                  {selectedPickerChat?.avatarDataUrl ? (
                    <ChatAvatar name={selectedPickerChat.name} src={selectedPickerChat.avatarDataUrl} className="quick-planner-mockup-chat-avatar" />
                  ) : selectedPickerChat ? (
                    <span className="quick-planner-mockup-chat-avatar">{getMockupChatInitial(selectedPickerChat.name)}</span>
                  ) : (
                    <span className="quick-planner-mockup-chat-avatar" aria-hidden="true">?</span>
                  )}
                  <span className="quick-planner-mockup-chat-copy">
                    <strong>{selectedPickerChat?.name ?? 'Choose a chat'}</strong>
                  </span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {chatPickerOpen && (
                  <div className="quick-planner-mockup-chat-menu">
                    <label className="quick-planner-mockup-chat-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        ref={chatSearchRef}
                        type="search"
                        value={chatQuery}
                        onChange={(event) => setChatQuery(event.target.value)}
                        placeholder="Search chats"
                        aria-label="Search chats"
                      />
                    </label>
                    <div className="quick-planner-mockup-chat-menu-heading">RECENT CHATS</div>
                    <div className="quick-planner-mockup-chat-options" role="listbox" aria-label="Choose a chat">
                      {filteredChats.map((chat) => (
                        <div
                          key={chat.id}
                          className={`quick-planner-mockup-chat-option-row${selectedPickerChat?.id === chat.id ? ' is-selected' : ''}`}
                          role="group"
                          aria-label={chat.name}
                        >
                          <button
                            className={`quick-planner-mockup-chat-option${selectedPickerChat?.id === chat.id ? ' is-selected' : ''}`}
                            type="button"
                            role="option"
                            aria-selected={selectedPickerChat?.id === chat.id}
                            onClick={() => {
                              setSelectedMockupChatId(chat.id);
                              onSelectChat?.(chat.sourceChat ?? null);
                              setChatPickerOpen(false);
                              setChatQuery('');
                            }}
                          >
                            {chat.avatarDataUrl ? (
                              <ChatAvatar name={chat.name} src={chat.avatarDataUrl} className="quick-planner-mockup-chat-avatar" />
                            ) : (
                              <span className="quick-planner-mockup-chat-avatar">{getMockupChatInitial(chat.name)}</span>
                            )}
                            <span className="quick-planner-mockup-chat-copy">
                              <strong>{chat.name}</strong>
                              <small>{chat.type}</small>
                            </span>
                            {selectedPickerChat?.id === chat.id && <Check size={16} aria-hidden="true" />}
                          </button>
                          <button
                            className="quick-planner-mockup-chat-option-remove"
                            type="button"
                            aria-label={`Remove ${chat.name} from Planner`}
                            title={`Remove ${chat.name} from Planner`}
                            onClick={() => removePickerChat(chat)}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      {filteredChats.length === 0 && (
                        <div className="quick-planner-mockup-chat-empty">No chats found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="quick-planner-mockup-action-mode">
                <span className="quick-planner-mockup-label">ACTION</span>
                <div className="quick-planner-mockup-mode-switch" role="group" aria-label="Preview action modes">
                  {mockupModes.map(({ label, icon: Icon }) => {
                    const active = selectedMode === label;

                    return (
                    <button
                      key={label}
                      className={active ? 'is-active' : ''}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedMode(label)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="quick-planner-mockup-composer">
              <div className="quick-planner-mockup-composer-meta">
                <span>MESSAGE</span>
                <span className="quick-planner-mockup-composer-meta-trailing">
                  {attachments.length > 0 && <span>{attachments.length} attached</span>}
                  <span className="quick-planner-mockup-counter-controls">
                    <span className="quick-planner-mockup-character-count">{String(message.length).padStart(2, '0')} <i>/</i> 1023</span>
                    <button
                      className={`quick-planner-mockup-clear-message${message ? '' : ' is-hidden'}`}
                      type="button"
                      aria-label="Clear reminder text"
                      aria-hidden={!message}
                      title="Clear text"
                      disabled={!message}
                      tabIndex={message ? 0 : -1}
                      onClick={() => {
                        setMessage('');
                        clearActionFeedback();
                        messageInputRef.current?.focus();
                      }}
                    >
                      <Eraser size={16} aria-hidden="true" />
                    </button>
                  </span>
                </span>
              </div>
              <textarea
                ref={messageInputRef}
                className="quick-planner-mockup-message"
                wrap="soft"
                aria-label="Reminder text"
                aria-describedby="quick-planner-mockup-counter"
                maxLength={1023}
                value={message}
                onChange={(event) => {
                  const nextMessage = event.target.value;
                  setMessage(nextMessage);
                  clearActionFeedback();
                  const caret = event.currentTarget.selectionStart;
                  const commandMatch = nextMessage.slice(0, caret).match(/(?:^|\s):([\p{L}\p{N}_-]*)$/iu);
                  if (commandMatch) {
                    const commandStart = caret - commandMatch[1].length - 1;
                    setEmojiCommandRange({ start: commandStart, end: caret });
                    setEmojiSearchQuery(commandMatch[1].replace(/[_-]/g, ' '));
                    setEmojiActiveIndex(0);
                    setEmojiPickerOpen(true);
                    setEffectPickerOpen(false);
                  } else if (emojiCommandRange) {
                    setEmojiCommandRange(null);
                    setEmojiSearchQuery('');
                    setEmojiPickerOpen(false);
                  }
                }}
                onKeyDown={handleEmojiPickerKeyDown}
                placeholder="Capture what matters..."
              />
              <span id="quick-planner-mockup-counter" className="quick-planner-mockup-sr-only">
                {message.length} of 1023 characters
              </span>
            </div>

            <div className="quick-planner-mockup-tools-row" ref={toolsRowRef}>
              <div className="quick-planner-mockup-tools" aria-label="Preview tools">
                <div className="quick-planner-mockup-tool-anchor">
                  <button type="button" aria-label="Attach files" onClick={() => attachmentInputRef.current?.click()}>
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                  <input ref={attachmentInputRef} className="quick-planner-mockup-file-input" type="file" multiple onChange={handleAttachmentChange} />
                </div>
                <div className="quick-planner-mockup-tool-anchor" ref={effectsToolRef}>
                  <button
                    className={effectPickerOpen || selectedEffectId ? 'is-active' : ''}
                    type="button"
                    aria-label="Message effects"
                    aria-expanded={effectPickerOpen}
                    aria-pressed={Boolean(selectedEffectId)}
                    title={selectedMockupEffect ? `Message effects: ${selectedMockupEffect.label}` : 'Message effects'}
                    onClick={toggleEffectPicker}
                  ><Sparkles size={18} aria-hidden="true" /></button>
                  {effectPickerOpen && (
                    <div className="quick-planner-mockup-tool-popover quick-planner-mockup-effects-picker" role="dialog" aria-label="Message effects">
                      <div className="quick-planner-mockup-effects-heading">
                        <strong>Message effect</strong>
                      </div>
                      <div className="quick-planner-mockup-effects-grid" role="group" aria-label="Choose message effect">
                        {mockupMessageEffects.map((effect) => {
                          const isSelected = effect.id === null
                            ? selectedEffectId === null
                            : selectedEffectId === effect.id;
                          return (
                            <button
                              key={effect.id ?? 'no-effect'}
                              className={`quick-planner-mockup-effect-option${isSelected ? ' is-selected' : ''}`}
                              type="button"
                              aria-label={effect.label}
                              aria-pressed={isSelected}
                              onClick={() => {
                                setSelectedEffectId(effect.id);
                                setEffectPickerOpen(false);
                              }}
                            >
                              <span className="quick-planner-mockup-effect-icon" aria-hidden="true">{effect.emoticon}</span>
                              <span className="quick-planner-mockup-effect-label">{effect.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="quick-planner-mockup-tool-anchor">
                  <button
                    className={emojiPickerOpen ? 'is-active' : ''}
                    type="button"
                    aria-label="Open emoji window"
                    title="Open emoji window (Ctrl+. / Cmd+.)"
                    aria-expanded={emojiPickerOpen}
                    onClick={toggleEmojiPicker}
                  ><Smile size={18} aria-hidden="true" /></button>
                  {emojiPickerOpen && (
                    <div className={`quick-planner-mockup-tool-popover quick-planner-mockup-emoji-picker${emojiModifierHeld ? ' is-modifier-held' : ''}`} role="dialog" aria-label="Choose emoji">
                      <div className="quick-planner-mockup-emoji-heading">
                        <strong>Emoji</strong>
                        <span>{normalizedEmojiSearchQuery ? 'Search results' : selectedEmojiCategory.label}</span>
                      </div>
                      {!normalizedEmojiSearchQuery && !emojiCommandRange && (
                        <div className="quick-planner-mockup-emoji-categories" role="tablist" aria-label="Emoji categories">
                          {mockupEmojiCategories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              role="tab"
                              aria-selected={emojiCategoryId === category.id}
                              onClick={() => setEmojiCategoryId(category.id)}
                            >{category.label}</button>
                          ))}
                        </div>
                      )}
                      <div className="quick-planner-mockup-emoji-results" role="group" aria-label={normalizedEmojiSearchQuery ? 'Emoji search results' : emojiCommandRange ? 'Emoji command results' : `${selectedEmojiCategory.label} emoji`}>
                        {visibleEmojiOptions.length > 0 ? (
                          <div className="quick-planner-mockup-emoji-grid">
                            {visibleEmojiOptions.map((option, index) => (
                              <button
                                key={`${option.categoryId}-${option.emoji}`}
                                className={(normalizedEmojiSearchQuery || emojiCommandRange) && index === emojiActiveIndex ? 'is-keyboard-active' : ''}
                                type="button"
                                aria-label={`Insert ${option.emoji}`}
                                title={`${option.emoji} ${option.name}`}
                                onClick={(event) => insertEmoji(option.emoji, event.ctrlKey || event.metaKey)}
                                onMouseEnter={() => setEmojiActiveIndex(index)}
                              >{option.emoji}</button>
                            ))}
                          </div>
                        ) : (
                          <p className="quick-planner-mockup-emoji-empty" role="status">No emojis found.</p>
                        )}
                      </div>
                      <section className="quick-planner-mockup-emoji-recent" aria-label="Recent emojis">
                          <div className="quick-planner-mockup-emoji-recent-heading">
                            <span>Recent</span>
                            <small className="quick-planner-mockup-emoji-multiselect-hint">Hold Ctrl to add more</small>
                          </div>
                        {recentEmojis.length > 0 ? (
                          <div className="quick-planner-mockup-emoji-grid" role="group" aria-label="Recent emoji">
                            {recentEmojis.map((emoji) => (
                              <button key={emoji} type="button" aria-label={`Insert recent ${emoji}`} title={`Insert ${emoji}`} onClick={(event) => insertEmoji(emoji, event.ctrlKey || event.metaKey, false)}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="quick-planner-mockup-emoji-recent-empty">No recent emojis yet</span>
                        )}
                      </section>
                      <input
                        className="quick-planner-mockup-emoji-search"
                        type="search"
                        value={emojiSearchQuery}
                        aria-label="Search emoji"
                        placeholder="Search emoji in English or Russian"
                        onChange={(event) => {
                          setEmojiSearchQuery(event.target.value);
                          setEmojiActiveIndex(0);
                        }}
                        onKeyDown={handleEmojiPickerKeyDown}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="quick-planner-mockup-schedule-row" ref={scheduleRowRef}>
              <span className="quick-planner-mockup-label quick-planner-mockup-schedule-label">
                {isDraftMode ? 'DRAFT' : selectedMode === 'Send now' ? 'SEND NOW' : 'SCHEDULE FOR'}
              </span>
              {!isDraftMode && (
                <div className="quick-planner-mockup-schedule-field">
                  <button
                    ref={scheduleDateTriggerRef}
                    type="button"
                    aria-label="Choose date"
                    aria-haspopup="dialog"
                    aria-expanded={activeSchedulePicker === 'date'}
                    onClick={() => {
                      setScheduleTimeDraft(null);
                      if (activeSchedulePicker !== 'date') {
                        setCalendarCursor(toLocalDateTime(selectedDate, '12:00'));
                      }
                      setActiveSchedulePicker((picker) => picker === 'date' ? null : 'date');
                    }}
                  >
                    <CalendarDays size={15} aria-hidden="true" />
                    <span>{formatDateLabel(selectedDate)}</span>
                    {selectedMode !== 'Send now' && <ChevronDown size={13} aria-hidden="true" />}
                  </button>
                  {activeSchedulePicker === 'date' && (
                    createPortal(
                      <div
                        ref={scheduleDatePickerRef}
                        className="quick-planner-mockup-schedule-popover quick-planner-mockup-date-picker"
                        role="dialog"
                        aria-label="Schedule date picker"
                        style={{
                          position: 'fixed',
                          top: schedulePickerPosition.top,
                          left: schedulePickerPosition.left,
                          maxHeight: schedulePickerPosition.maxHeight,
                          '--mockup-accent': mockupAccent,
                          '--mockup-accent-rgb': mockupAccentRgb,
                        } as CSSProperties}
                      >
                        <div className="quick-planner-mockup-date-picker-header">
                          <button
                            type="button"
                            aria-label="Previous month"
                            disabled={calendarMonthKey <= minimumMonthKey}
                            onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                          >
                            <ChevronLeft size={14} aria-hidden="true" />
                          </button>
                          <span>{calendarMonthLabel}</span>
                          <button
                            type="button"
                            aria-label="Next month"
                            onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                          >
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="quick-planner-mockup-date-picker-weekdays" aria-hidden="true">
                          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
                        </div>
                        <div className="quick-planner-mockup-date-picker-grid">
                          {Array.from({ length: calendarFirstWeekdayOffset }, (_, index) => (
                            <span key={`gap-${index}`} className="quick-planner-mockup-date-picker-gap" aria-hidden="true" />
                          ))}
                          {Array.from({ length: calendarDayCount }, (_, index) => {
                            const dayNumber = index + 1;
                            const cellValue = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
                            const isSelected = cellValue === selectedDate;
                            const isToday = cellValue === todayScheduleDateValue;
                            const isDisabled = cellValue < minimumScheduleDateValue;
                            return (
                              <button
                                key={cellValue}
                                type="button"
                                aria-label={`Choose ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(calendarYear, calendarMonth, dayNumber))}`}
                                aria-pressed={isSelected}
                                className={`${isSelected ? 'is-selected' : ''}${isToday ? ' is-today' : ''}`.trim()}
                                disabled={isDisabled}
                                onClick={() => {
                                  setScheduleDateTimeWithinRange(cellValue, selectedTime);
                                  setActiveSchedulePicker(null);
                                }}
                              >{dayNumber}</button>
                            );
                          })}
                        </div>
                      </div>,
                      document.body,
                    )
                  )}
                </div>
              )}
              {!isDraftMode && (
                <div className="quick-planner-mockup-time-value">
                  <div className="quick-planner-mockup-schedule-field">
                    <button
                        ref={scheduleTimeTriggerRef}
                      type="button"
                      aria-label="Choose time"
                      aria-haspopup="dialog"
                      aria-expanded={activeSchedulePicker === 'time'}
                      onClick={() => {
                        setActiveSchedulePicker((picker) => picker === 'time' ? null : 'time');
                        setScheduleTimeDraft(null);
                      }}
                    >
                      <Clock3 size={15} aria-hidden="true" />
                      <span>{selectedTime}</span>
                      {selectedMode !== 'Send now' && <ChevronDown size={13} aria-hidden="true" />}
                    </button>
                    {activeSchedulePicker === 'time' && (
                        createPortal(
                          <div
                            ref={scheduleTimePickerRef}
                            className="quick-planner-mockup-schedule-popover quick-planner-mockup-time-picker"
                            role="dialog"
                            aria-label="Schedule time picker"
                            style={{
                              position: 'fixed',
                              top: schedulePickerPosition.top,
                              left: schedulePickerPosition.left,
                              maxHeight: schedulePickerPosition.maxHeight,
                              '--mockup-accent': mockupAccent,
                              '--mockup-accent-rgb': mockupAccentRgb,
                            } as CSSProperties}
                          >
                          <input
                            className="quick-planner-mockup-time-field"
                            aria-label="Enter schedule time"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            autoFocus
                            value={scheduleTimeDraft ?? selectedTime}
                            onChange={(event) => {
                              const parsed = parseScheduleTime(event.currentTarget.value);
                              if (parsed) {
                                setScheduleTimeDraft(null);
                                setScheduleDateTimeWithinRange(selectedDate, parsed);
                              } else {
                                setScheduleTimeDraft(event.currentTarget.value.slice(0, 5));
                              }
                            }}
                            onBlur={() => setScheduleTimeDraft(null)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              const parsed = parseScheduleTime(event.currentTarget.value);
                              if (!parsed) return;
                              setScheduleTimeDraft(null);
                              setScheduleDateTimeWithinRange(selectedDate, parsed);
                              setActiveSchedulePicker(null);
                            }}
                          />
                          <div className="quick-planner-mockup-time-list" role="listbox" aria-label="Available times">
                            {scheduleTimeOptions.map((option) => {
                              const isSelected = option === selectedTime;
                              const isPast = selectedDate < minimumScheduleDateValue
                                || (selectedDate === minimumScheduleDateValue && option < minimumScheduleTimeValue);
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  disabled={isPast}
                                  onClick={() => {
                                    setScheduleTimeDraft(null);
                                    setScheduleDateTimeWithinRange(selectedDate, option);
                                    setActiveSchedulePicker(null);
                                  }}
                                >{option}</button>
                              );
                            })}
                          </div>
                          </div>,
                          document.body,
                        )
                    )}
                  </div>
                  <span className={`quick-planner-mockup-timezone${isScheduleMode ? '' : ' is-no-presets'}`}>{timeZoneLabel}</span>
                </div>
              )}
              {isScheduleMode && (
                <div className="quick-planner-mockup-presets" role="group" aria-label="Quick schedule times">
                  <button type="button" onClick={() => applyQuickTime('now')}>NOW</button>
                  <button type="button" onClick={() => applyQuickTime('30min')}>+30 MIN</button>
                  <button type="button" onClick={() => applyQuickTime('tomorrow')}>TOMORROW</button>
                </div>
              )}
              {isDraftMode && (
                <div className="quick-planner-mockup-draft-actions">
                  <button className="quick-planner-mockup-open-studio" type="button" onClick={handleOpenInStudio}>
                    <ArrowUpRight size={15} aria-hidden="true" />
                    <span>Open in Studio</span>
                  </button>
                  <button className="quick-planner-mockup-submit" type="button" onClick={handleMockSubmit}>
                    <SubmitIcon size={16} aria-hidden="true" />
                    <span>{submitLabel}</span>
                  </button>
                </div>
              )}
              {!isDraftMode && (
                <button className="quick-planner-mockup-submit" type="button" onClick={handleMockSubmit}>
                  <SubmitIcon size={16} aria-hidden="true" />
                  <span>{submitLabel}</span>
                </button>
              )}
            </div>

            <div className="quick-planner-mockup-compose-footer">
              {actionFeedback && (
                <div
                  key={actionFeedbackInstance}
                  className={`planner-inline-notification quick-planner-mockup-action-feedback is-${actionFeedback.tone}`}
                  role={actionFeedback.tone === 'error' ? 'alert' : 'status'}
                  aria-live={actionFeedback.tone === 'error' ? 'assertive' : 'polite'}
                  aria-atomic="true"
                >
                  <span>{actionFeedback.message}</span>
                </div>
              )}
            </div>

          </section>

          <aside className="quick-planner-mockup-guide" aria-label="Planner notes">
            <div className="quick-planner-mockup-guide-heading">
              <h2>Make room<br />for the thought.</h2>
            </div>
            <ol className="quick-planner-mockup-notes">
              {mockupNotes.map(({ number, title, text }) => (
                <li key={number}>
                  <span className="quick-planner-mockup-note-number">{number}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

      </div>
    </main>
  );
}