import { type ChangeEvent, type CSSProperties, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Chat } from '@/types';
import { useLocale } from '@/lib/i18n';
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
import { telegramGetFilePath } from '@/services/telegramAppService';
import { ChatAvatar } from '../studio/components/ChatAvatar';
import { QuickPlannerNavigationContext } from '../workspace/QuickPlannerNavigationContext';
import './QuickPlannerMockup.css';

const mockupModes = [
  { mode: 'Send now', labelKey: 'quickplanner.mode.send', icon: Send },
  { mode: 'Schedule', labelKey: 'quickplanner.mode.schedule', icon: CalendarDays },
  { mode: 'Draft', labelKey: 'quickplanner.mode.draft', icon: FileText },
] as const;

type MockupFeedback = {
  message: string;
  tone: 'error' | 'warning' | 'success' | 'info';
};

type MockupAttachment = {
  name: string;
  path: string;
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
  onSendNow?: (chat: Chat, message: string, attachments?: string[], effect?: string) => Promise<boolean>;
  onSchedule?: (request: { chatId: string; message: string; date: string; time: string; attachments?: string[]; effect?: string }) => Promise<boolean>;
  onSaveDraft?: (draft: { message: string; attachments: string[] }) => boolean;
};

type TelegramMessageEffect = {
  id: string;
  emoticon: string;
  premiumRequired: boolean;
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
const mockupSampleChatTranslationKeys = {
  'design-updates': 'plannerMockup.sampleChat.designUpdates',
  'release-room': 'plannerMockup.sampleChat.releaseRoom',
  'product-news': 'plannerMockup.sampleChat.productNews',
  'studio-feedback': 'plannerMockup.sampleChat.studioFeedback',
  'weekly-digest': 'plannerMockup.sampleChat.weeklyDigest',
  'launch-planning': 'plannerMockup.sampleChat.launchPlanning',
  'telegram-tips': 'plannerMockup.sampleChat.telegramTips',
  'design-review': 'plannerMockup.sampleChat.designReview',
  community: 'plannerMockup.sampleChat.community',
} as const;

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
const mockupCategoryRussianNames: Record<string, string> = {
  faces: 'лица улыбки',
  hands: 'жесты руки',
  hearts: 'сердца любовь',
  nature: 'природа',
  food: 'еда напитки',
  fun: 'разное развлечения',
};
const mockupCategoryTranslationKeys = {
  faces: 'plannerMockup.category.faces',
  hands: 'plannerMockup.category.hands',
  hearts: 'plannerMockup.category.hearts',
  nature: 'plannerMockup.category.nature',
  food: 'plannerMockup.category.food',
  fun: 'plannerMockup.category.fun',
} as const;
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
  searchText: `${mockupEmojiNames[emoji] ?? ''} ${mockupEmojiRussianNames[emoji] ?? ''} ${category.label} ${mockupCategoryRussianNames[category.id] ?? ''}`.toLocaleLowerCase(),
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
const scheduleTimeOptions = Array.from({ length: 96 }, (_, index) => (
  `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`
));
const maxQuickPlannerAttachments = 10;
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

function formatDateLabel(value: string, locale: 'en' | 'ru') {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  const label = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' }).format(date);
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
  const { locale, t } = useLocale();
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
  const [availableEffects, setAvailableEffects] = useState<TelegramMessageEffect[]>([]);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MockupAttachment[]>([]);
  const [attachmentScroll, setAttachmentScroll] = useState({ max: 0, position: 0, contentWidth: 0 });
  const [editorAppearance, setEditorAppearance] = useState(readEditorAppearancePreferences);
  const [actionFeedback, setActionFeedback] = useState<MockupFeedback | null>(null);
  const [actionFeedbackInstance, setActionFeedbackInstance] = useState(0);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [selectedMockupChatId, setSelectedMockupChatId] = useState(mockupChats[0].id);
  const [removedMockupChatIds, setRemovedMockupChatIds] = useState<string[]>([]);
  const isScheduleMode = selectedMode === 'Schedule';
  const isDraftMode = selectedMode === 'Draft';
  const selectedEffect = availableEffects.find((effect) => effect.id === selectedEffectId) ?? null;
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
  const dateLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const calendarMonthLabel = new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric' }).format(calendarCursor);
  const calendarWeekdayLabels = Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(new Date(2024, 0, index + 1))
  ));
  const calendarMonthKey = calendarYear * 12 + calendarMonth;
  const minimumMonthKey = Number(minimumScheduleDateValue.slice(0, 4)) * 12 + Number(minimumScheduleDateValue.slice(5, 7)) - 1;
  const todayScheduleDateValue = toDateInputValue(new Date());
  const SubmitIcon = selectedMode === 'Send now' ? Send : selectedMode === 'Draft' ? FileText : CalendarDays;
  const submitLabel = selectedMode === 'Send now' ? t('studio.sendNow') : selectedMode === 'Draft' ? t('plannerMockup.saveDraftAction') : t('plannerMockup.schedulePost');
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
  const attachmentScrollbarRef = useRef<HTMLDivElement>(null);
  const attachmentListRef = useRef<HTMLDivElement>(null);
  const actionFeedbackTimeoutRef = useRef<number | null>(null);
  const emojiReleaseCloseTimeoutRef = useRef<number | null>(null);
  const emojiSelectionWaitingForReleaseRef = useRef(false);

  useLayoutEffect(() => {
    const list = attachmentListRef.current;
    const scrollbar = attachmentScrollbarRef.current;
    if (!list || !scrollbar) return undefined;

    const updateMetrics = () => {
      const max = Math.max(0, list.scrollWidth - list.clientWidth);
      const position = Math.min(list.scrollLeft, max);
      if (list.scrollLeft !== position) list.scrollLeft = position;
      if (scrollbar.scrollLeft !== position) scrollbar.scrollLeft = position;
      const contentWidth = Math.max(list.scrollWidth, list.clientWidth);
      setAttachmentScroll((current) => current.max === max
        && current.position === position
        && current.contentWidth === contentWidth
        ? current
        : { max, position, contentWidth });
    };
    const syncFromList = () => {
      if (scrollbar.scrollLeft !== list.scrollLeft) scrollbar.scrollLeft = list.scrollLeft;
      setAttachmentScroll((current) => current.position === list.scrollLeft
        ? current
        : { ...current, position: list.scrollLeft });
    };
    const syncFromScrollbar = () => {
      if (list.scrollLeft !== scrollbar.scrollLeft) list.scrollLeft = scrollbar.scrollLeft;
      setAttachmentScroll((current) => current.position === scrollbar.scrollLeft
        ? current
        : { ...current, position: scrollbar.scrollLeft });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMetrics);
    resizeObserver?.observe(list);
    Array.from(list.children).forEach((child) => resizeObserver?.observe(child));
    list.addEventListener('scroll', syncFromList, { passive: true });
    scrollbar.addEventListener('scroll', syncFromScrollbar, { passive: true });
    window.addEventListener('resize', updateMetrics);
    updateMetrics();

    return () => {
      resizeObserver?.disconnect();
      list.removeEventListener('scroll', syncFromList);
      scrollbar.removeEventListener('scroll', syncFromScrollbar);
      window.removeEventListener('resize', updateMetrics);
    };
  }, [attachments.length]);

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
      type: chat.type === 'private' ? t('studio.privateChat')
          : chat.type === 'group' ? t('studio.groupChat')
          : chat.type === 'supergroup' ? t('studio.supergroup')
            : chat.type === 'channel' ? t('studio.channelType') : t('studio.chatType'),
      avatarDataUrl: chat.avatarDataUrl,
      sourceChat: chat,
    }))
    : mockupChats.map((chat) => ({
      ...chat,
      name: chat.id === 'saved'
        ? t('chat.savedMessages')
        : mockupSampleChatTranslationKeys[chat.id as keyof typeof mockupSampleChatTranslationKeys]
          ? t(mockupSampleChatTranslationKeys[chat.id as keyof typeof mockupSampleChatTranslationKeys])
          : chat.name,
      type: chat.type === 'Personal notes' ? t('plannerMockup.personalNotes')
        : chat.type === 'Private chat' ? t('studio.privateChat')
          : chat.type === 'Group chat' ? t('studio.groupChat')
            : chat.type === 'Channel' ? t('studio.channelType') : chat.type,
    }));
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
    let active = true;
    const getAvailableEffects = window.telegram?.getAvailableEffects;
    if (typeof getAvailableEffects !== 'function') return undefined;

    void getAvailableEffects().then((result) => {
      if (active && result.success) setAvailableEffects(result.effects ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

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
    if (!message.trim() && attachments.length === 0) {
      showActionFeedback(t('plannerMockup.writeMessage'), 'warning');
      return;
    }
    if (
      isScheduleMode
      && toLocalDateTime(selectedDate, selectedTime).getTime() < minimumScheduleDateTime.getTime()
    ) {
      showActionFeedback(t('plannerMockup.scheduleAtLeastOneMinute'), 'warning');
      return;
    }
    if (isDraftMode) {
      if (onSaveDraft) {
        if (!onSaveDraft({ message, attachments: attachments.map(({ path }) => path) })) {
          showActionFeedback(t('plannerMockup.couldNotSaveDraft'), 'error');
          return;
        }
        showActionFeedback(t('plannerMockup.draftSavedToPosts'), 'success');
        setMessage('');
        setAttachments([]);
        openPosts('drafts');
        return;
      }
      showActionFeedback(t('plannerMockup.draftSavedPreview'), 'success');
    } else if (selectedMode === 'Send now') {
      if (onSendNow) {
        const chat = selectedPickerChat?.sourceChat;
        if (!chat) {
          showActionFeedback(t('plannerMockup.selectConnectedChat'), 'warning');
          return;
        }
        try {
          const sent = await onSendNow(
            chat,
            message,
            attachments.length > 0 ? attachments.map(({ path }) => path) : undefined,
            selectedEffectId ?? undefined,
          );
          if (!sent) {
            showActionFeedback(t('plannerMockup.messageNotSent'), 'error');
            return;
          }
          showActionFeedback(t('plannerMockup.messageSent'), 'success');
          setMessage('');
          setAttachments([]);
          setSelectedEffectId(null);
        } catch {
          showActionFeedback(t('plannerMockup.messageCouldNotSend'), 'error');
        }
        return;
      }
      showActionFeedback(t('plannerMockup.previewOnly'), 'warning');
    } else {
      if (onSchedule) {
        const chat = selectedPickerChat?.sourceChat;
        if (!chat) {
          showActionFeedback(t('plannerMockup.selectConnectedChat'), 'warning');
          return;
        }
        try {
          const scheduled = await onSchedule({
            chatId: chat.id,
            message,
            date: selectedDate,
            time: selectedTime,
            ...(attachments.length > 0 ? { attachments: attachments.map(({ path }) => path) } : {}),
            ...(selectedEffectId ? { effect: selectedEffectId } : {}),
          });
          if (!scheduled) {
            showActionFeedback(t('plannerMockup.messageCouldNotSchedule'), 'error');
            return;
          }
          showActionFeedback(t('plannerMockup.scheduleRequestSent'), 'success');
          setMessage('');
          setAttachments([]);
          setSelectedEffectId(null);
          openPosts('scheduled');
        } catch {
          showActionFeedback(t('plannerMockup.messageCouldNotSchedule'), 'error');
        }
        return;
      }
      showActionFeedback(t('plannerMockup.schedulePreview', { date: formatDateLabel(selectedDate, locale), time: selectedTime }), 'info');
    }
  };

  const handleOpenInStudio = () => {
    if (!message.trim() && attachments.length === 0) {
      showActionFeedback(t('plannerMockup.writeBeforeStudio'), 'warning');
      return;
    }
    if (onOpenInStudio) {
      onOpenInStudio({
        text: message,
        attachments: attachments.map(({ path }) => path),
        entities: [],
        ...(selectedEffectId ? { effect: selectedEffectId } : {}),
      });
      return;
    }
    openStudio();
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    if (selectedFiles.length > 0) {
      const resolvedFiles = selectedFiles.flatMap((file) => {
        try {
          const path = telegramGetFilePath(file);
          return path ? [{ name: file.name, path }] : [];
        } catch {
          return [];
        }
      });
      const remainingSlots = Math.max(0, maxQuickPlannerAttachments - attachments.length);
      const acceptedFiles = resolvedFiles.slice(0, remainingSlots);
      if (acceptedFiles.length > 0) {
        setAttachments((current) => [...current, ...acceptedFiles].slice(0, maxQuickPlannerAttachments));
      }
      const limitReached = resolvedFiles.length > remainingSlots;
      const someFilesUnavailable = resolvedFiles.length !== selectedFiles.length;
      showActionFeedback(
        limitReached
          ? t('plannerMockup.attachmentLimit', { count: maxQuickPlannerAttachments })
          : someFilesUnavailable
            ? t('plannerMockup.someFilesUnavailable')
            : acceptedFiles.length === 1
              ? t('plannerMockup.fileAdded')
              : t('plannerMockup.filesAdded'),
        limitReached || someFilesUnavailable ? 'warning' : 'success',
      );
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
            <h1 ref={headingRef} id="quick-planner-mockup-title">{t('plannerMockup.newMessage')}</h1>
          </div>
        </header>

        <div className="quick-planner-mockup-layout">
          <section ref={workbenchRef} className="quick-planner-mockup-workbench" aria-label={t('plannerMockup.sectionLabel')}>
            <div className="quick-planner-mockup-toolbar">
              <div className="quick-planner-mockup-destination" ref={chatPickerRef}>
                <span className="quick-planner-mockup-label">{t('plannerMockup.sendTo')}</span>
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
                    <strong>{selectedPickerChat?.name ?? t('plannerMockup.chooseChat')}</strong>
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
                        placeholder={t('plannerMockup.searchChats')}
                        aria-label={t('plannerMockup.searchChats')}
                      />
                    </label>
                    <div className="quick-planner-mockup-chat-menu-heading">{t('plannerMockup.recentChats')}</div>
                    <div className="quick-planner-mockup-chat-options" role="listbox" aria-label={t('plannerMockup.chatList')}>
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
                            aria-label={t('plannerMockup.removeChat', { chat: chat.name })}
                            title={t('plannerMockup.removeChat', { chat: chat.name })}
                            onClick={() => removePickerChat(chat)}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      {filteredChats.length === 0 && (
                        <div className="quick-planner-mockup-chat-empty">{t('plannerMockup.noChatsFound')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="quick-planner-mockup-action-mode">
                <span className="quick-planner-mockup-label">{t('plannerMockup.action')}</span>
                <div className="quick-planner-mockup-mode-switch" role="group" aria-label={t('plannerMockup.actionModes')}>
                  {mockupModes.map(({ mode, labelKey, icon: Icon }) => {
                    const active = selectedMode === mode;

                    return (
                    <button
                      key={mode}
                      className={active ? 'is-active' : ''}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedMode(mode)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{t(labelKey)}</span>
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="quick-planner-mockup-composer">
              <div className="quick-planner-mockup-composer-meta">
                <span>{t('plannerMockup.message')}</span>
                <span className="quick-planner-mockup-composer-meta-trailing">
                  {attachments.length > 0 && (
                    <span>{t(getAttachmentCountTranslationKey(locale, attachments.length), { count: attachments.length })}</span>
                  )}
                  <span className="quick-planner-mockup-counter-controls">
                    <span className="quick-planner-mockup-character-count">{String(message.length).padStart(2, '0')} <i>/</i> 1023</span>
                    <button
                      className={`quick-planner-mockup-clear-message${message ? '' : ' is-hidden'}`}
                      type="button"
                      aria-label={t('plannerMockup.clearReminderText')}
                      aria-hidden={!message}
                      title={t('plannerMockup.clearText')}
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
                aria-label={t('plannerMockup.reminderText')}
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
                placeholder={t('plannerMockup.messagePlaceholder')}
              />
              <span id="quick-planner-mockup-counter" className="quick-planner-mockup-sr-only">
                {t('plannerMockup.characterCount', { count: message.length })}
              </span>
            </div>
            <div className="quick-planner-mockup-tools-row" ref={toolsRowRef}>
              <div className="quick-planner-mockup-tools" aria-label={t('plannerMockup.tools')}>
                <div className="quick-planner-mockup-tool-anchor">
                  <button type="button" aria-label={t('plannerMockup.attachFiles')} onClick={() => attachmentInputRef.current?.click()}>
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                  <input ref={attachmentInputRef} className="quick-planner-mockup-file-input" type="file" multiple onChange={handleAttachmentChange} />
                </div>
                <div className="quick-planner-mockup-tool-anchor" ref={effectsToolRef}>
                  <button
                    className={effectPickerOpen || selectedEffectId ? 'is-active' : ''}
                    type="button"
                    aria-label={t('plannerMockup.messageEffects')}
                    aria-expanded={effectPickerOpen}
                    aria-pressed={Boolean(selectedEffectId)}
                    title={selectedEffect ? `${t('plannerMockup.messageEffects')}: ${selectedEffect.emoticon}` : t('plannerMockup.messageEffects')}
                    onClick={toggleEffectPicker}
                  ><Sparkles size={18} aria-hidden="true" /></button>
                  {effectPickerOpen && (
                    <div className="quick-planner-mockup-tool-popover quick-planner-mockup-effects-picker" role="dialog" aria-label={t('plannerMockup.messageEffects')}>
                      <div className="quick-planner-mockup-effects-heading">
                        <strong>{t('plannerMockup.messageEffect')}</strong>
                      </div>
                      <div className="quick-planner-mockup-effects-grid" role="group" aria-label={t('plannerMockup.chooseMessageEffect')}>
                        {[
                          { id: null, emoticon: '−', premiumRequired: false },
                          ...availableEffects,
                        ].map((effect) => {
                          const isSelected = effect.id === null
                            ? selectedEffectId === null
                            : selectedEffectId === effect.id;
                          const effectLabel = effect.id === null
                            ? t('plannerMockup.noEffect')
                            : effect.premiumRequired
                              ? t('plannerMockup.premiumEffect', { emoji: effect.emoticon })
                              : t('plannerMockup.effect', { emoji: effect.emoticon });
                          return (
                            <button
                              key={effect.id ?? 'no-effect'}
                              className={`quick-planner-mockup-effect-option${isSelected ? ' is-selected' : ''}`}
                              type="button"
                              aria-label={effectLabel}
                              title={effect.id === null ? effectLabel : `${effectLabel} · ${effect.id}`}
                              aria-pressed={isSelected}
                              onClick={() => {
                                setSelectedEffectId(effect.id);
                                setEffectPickerOpen(false);
                              }}
                            >
                              <span className="quick-planner-mockup-effect-icon" aria-hidden="true">{effect.emoticon}</span>
                              <span className="quick-planner-mockup-effect-label">{effect.id === null ? effectLabel : effect.premiumRequired ? t('plannerMockup.premium') : effect.emoticon}</span>
                            </button>
                          );
                        })}
                      </div>
                      {availableEffects.length === 0 && (
                        <p className="quick-planner-mockup-effects-empty" role="status">{t('plannerMockup.telegramEffectsUnavailable')}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="quick-planner-mockup-tool-anchor">
                  <button
                    className={emojiPickerOpen ? 'is-active' : ''}
                    type="button"
                    aria-label={t('plannerMockup.openEmoji')}
                    title={t('plannerMockup.openEmojiTitle')}
                    aria-expanded={emojiPickerOpen}
                    onClick={toggleEmojiPicker}
                  ><Smile size={18} aria-hidden="true" /></button>
                  {emojiPickerOpen && (
                    <div className={`quick-planner-mockup-tool-popover quick-planner-mockup-emoji-picker${emojiModifierHeld ? ' is-modifier-held' : ''}`} role="dialog" aria-label={t('plannerMockup.chooseEmoji')}>
                      <div className="quick-planner-mockup-emoji-heading">
                        <strong>{t('plannerMockup.emoji')}</strong>
                        <span>{normalizedEmojiSearchQuery ? t('plannerMockup.searchResults') : t(mockupCategoryTranslationKeys[selectedEmojiCategory.id as keyof typeof mockupCategoryTranslationKeys])}</span>
                      </div>
                      {!normalizedEmojiSearchQuery && !emojiCommandRange && (
                        <div className="quick-planner-mockup-emoji-categories" role="tablist" aria-label={t('plannerMockup.emojiCategories')}>
                          {mockupEmojiCategories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              role="tab"
                              aria-selected={emojiCategoryId === category.id}
                              onClick={() => setEmojiCategoryId(category.id)}
                            >{t(mockupCategoryTranslationKeys[category.id as keyof typeof mockupCategoryTranslationKeys])}</button>
                          ))}
                        </div>
                      )}
                      <div className="quick-planner-mockup-emoji-results" role="group" aria-label={normalizedEmojiSearchQuery ? t('plannerMockup.emojiSearchResults') : emojiCommandRange ? t('plannerMockup.emojiCommandResults') : t('plannerMockup.categoryEmoji', { category: t(mockupCategoryTranslationKeys[selectedEmojiCategory.id as keyof typeof mockupCategoryTranslationKeys]) })}>
                        {visibleEmojiOptions.length > 0 ? (
                          <div className="quick-planner-mockup-emoji-grid">
                            {visibleEmojiOptions.map((option, index) => (
                              <button
                                key={`${option.categoryId}-${option.emoji}`}
                                className={(normalizedEmojiSearchQuery || emojiCommandRange) && index === emojiActiveIndex ? 'is-keyboard-active' : ''}
                                type="button"
                                aria-label={t('plannerMockup.insertEmoji', { emoji: option.emoji })}
                                title={`${option.emoji} ${locale === 'ru' ? mockupEmojiRussianNames[option.emoji] ?? option.name : option.name}`}
                                onClick={(event) => insertEmoji(option.emoji, event.ctrlKey || event.metaKey)}
                                onMouseEnter={() => setEmojiActiveIndex(index)}
                              >{option.emoji}</button>
                            ))}
                          </div>
                        ) : (
                          <p className="quick-planner-mockup-emoji-empty" role="status">{t('plannerMockup.noEmojisFound')}</p>
                        )}
                      </div>
                      <section className="quick-planner-mockup-emoji-recent" aria-label={t('plannerMockup.recentEmojis')}>
                          <div className="quick-planner-mockup-emoji-recent-heading">
                            <span>{t('plannerMockup.recent')}</span>
                            <small className="quick-planner-mockup-emoji-multiselect-hint">{t('plannerMockup.holdCtrl')}</small>
                          </div>
                        {recentEmojis.length > 0 ? (
                          <div className="quick-planner-mockup-emoji-grid" role="group" aria-label={t('plannerMockup.recentEmoji')}>
                            {recentEmojis.map((emoji) => (
                              <button key={emoji} type="button" aria-label={t('plannerMockup.insertRecentEmoji', { emoji })} title={t('plannerMockup.insertEmoji', { emoji })} onClick={(event) => insertEmoji(emoji, event.ctrlKey || event.metaKey, false)}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="quick-planner-mockup-emoji-recent-empty">{t('plannerMockup.noRecentEmojis')}</span>
                        )}
                      </section>
                      <input
                        className="quick-planner-mockup-emoji-search"
                        type="search"
                        value={emojiSearchQuery}
                        aria-label={t('plannerMockup.searchEmoji')}
                        placeholder={t('plannerMockup.searchEmojiPlaceholder')}
                        onChange={(event) => {
                          setEmojiSearchQuery(event.target.value);
                          setEmojiActiveIndex(0);
                        }}
                        onKeyDown={handleEmojiPickerKeyDown}
                      />
                    </div>
                  )}
                </div>
                {attachments.length > 0 && (
                  <div className="quick-planner-mockup-attachments" role="group" aria-label={t('plannerMockup.attachments', { count: attachments.length })}>
                    <div
                      className="quick-planner-mockup-attachments-scrollbar"
                      ref={attachmentScrollbarRef}
                      role="scrollbar"
                      aria-label={t('plannerMockup.scrollAttachments')}
                      aria-controls="quick-planner-mockup-attachment-list"
                      aria-orientation="horizontal"
                      aria-valuemin={0}
                      aria-valuemax={attachmentScroll.max}
                      aria-valuenow={Math.min(attachmentScroll.position, attachmentScroll.max)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        const step = event.key === 'PageDown' || event.key === 'PageUp' ? 100 : 32;
                        const direction = event.key === 'ArrowRight' || event.key === 'PageDown' ? 1
                          : event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 0;
                        if (event.key === 'Home') attachmentScrollbarRef.current!.scrollLeft = 0;
                        else if (event.key === 'End') attachmentScrollbarRef.current!.scrollLeft = attachmentScroll.max;
                        else if (direction) attachmentScrollbarRef.current!.scrollLeft += direction * step;
                        else return;
                        event.preventDefault();
                      }}
                    >
                      <div className="quick-planner-mockup-attachments-scrollbar-content" style={{ width: `${attachmentScroll.contentWidth}px` }} />
                    </div>
                    <div className="quick-planner-mockup-attachment-list" ref={attachmentListRef}>
                      {attachments.map((attachment, index) => (
                        <div className="quick-planner-mockup-attachment" key={`${attachment.path}-${index}`}>
                          <Paperclip size={14} aria-hidden="true" />
                          <span className="quick-planner-mockup-attachment-name" title={attachment.name}>{attachment.name}</span>
                          <button
                            type="button"
                            aria-label={t('composer.removeAttachment', { name: attachment.name })}
                            title={t('composer.removeAttachment', { name: attachment.name })}
                            onClick={() => setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                          ><X size={14} aria-hidden="true" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="quick-planner-mockup-schedule-row" ref={scheduleRowRef}>
              <span className="quick-planner-mockup-label quick-planner-mockup-schedule-label">
                {isDraftMode ? t('plannerMockup.draft') : selectedMode === 'Send now' ? t('plannerMockup.sendNow') : t('plannerMockup.scheduleFor')}
              </span>
              {!isDraftMode && (
                <div className="quick-planner-mockup-schedule-field">
                  <button
                    ref={scheduleDateTriggerRef}
                    type="button"
                    aria-label={t('plannerMockup.chooseDate')}
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
                    <span>{formatDateLabel(selectedDate, locale)}</span>
                    {selectedMode !== 'Send now' && <ChevronDown size={13} aria-hidden="true" />}
                  </button>
                  {activeSchedulePicker === 'date' && (
                    createPortal(
                      <div
                        ref={scheduleDatePickerRef}
                        className="quick-planner-mockup-schedule-popover quick-planner-mockup-date-picker"
                        role="dialog"
                        aria-label={t('plannerMockup.scheduleDatePicker')}
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
                            aria-label={t('plannerMockup.previousMonth')}
                            disabled={calendarMonthKey <= minimumMonthKey}
                            onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                          >
                            <ChevronLeft size={14} aria-hidden="true" />
                          </button>
                          <span>{calendarMonthLabel}</span>
                          <button
                            type="button"
                            aria-label={t('plannerMockup.nextMonth')}
                            onClick={() => setCalendarCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                          >
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="quick-planner-mockup-date-picker-weekdays" aria-hidden="true">
                          {calendarWeekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
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
                                aria-label={t('plannerMockup.chooseDay', { date: new Intl.DateTimeFormat(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(calendarYear, calendarMonth, dayNumber)) })}
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
                      aria-label={t('plannerMockup.chooseTime')}
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
                            aria-label={t('plannerMockup.scheduleTimePicker')}
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
                            aria-label={t('plannerMockup.enterScheduleTime')}
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
                          <div className="quick-planner-mockup-time-list" role="listbox" aria-label={t('plannerMockup.availableTimes')}>
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
                <div className="quick-planner-mockup-presets" role="group" aria-label={t('plannerMockup.quickScheduleTimes')}>
                  <button type="button" onClick={() => applyQuickTime('now')}>{t('plannerMockup.now')}</button>
                  <button type="button" onClick={() => applyQuickTime('30min')}>{t('plannerMockup.in30Minutes')}</button>
                  <button type="button" onClick={() => applyQuickTime('tomorrow')}>{t('plannerMockup.tomorrow')}</button>
                </div>
              )}
              {isDraftMode && (
                <div className="quick-planner-mockup-draft-actions">
                  <button className="quick-planner-mockup-open-studio" type="button" onClick={handleOpenInStudio}>
                    <ArrowUpRight size={15} aria-hidden="true" />
                    <span>{t('plannerMockup.openInStudio')}</span>
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

          <aside className="quick-planner-mockup-guide" aria-label={t('plannerMockup.notes')}>
            <div className="quick-planner-mockup-guide-heading">
              <h2 aria-label={t('plannerMockup.guideTitle')}>
                {t('plannerMockup.guideTitleFirst')}<br />{t('plannerMockup.guideTitleSecond')}
              </h2>
            </div>
            <ol className="quick-planner-mockup-notes">
              {[
                { number: '01', title: t('plannerMockup.noteOneTitle'), text: t('plannerMockup.noteOneText') },
                { number: '02', title: t('plannerMockup.noteTwoTitle'), text: t('plannerMockup.noteTwoText') },
                { number: '03', title: t('plannerMockup.noteThreeTitle'), text: t('plannerMockup.noteThreeText') },
              ].map(({ number, title, text }) => (
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

function getAttachmentCountTranslationKey(locale: 'en' | 'ru', count: number) {
  if (locale === 'en') return count === 1 ? 'plannerMockup.attachmentOne' : 'plannerMockup.attachments';
  const plural = new Intl.PluralRules('ru').select(count);
  if (plural === 'one') return 'plannerMockup.attachmentOne';
  return plural === 'few' ? 'plannerMockup.attachmentsFew' : 'plannerMockup.attachments';
}