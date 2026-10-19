import type { DraftAttachment, PublishRequest } from '@/domain/messageDraft';

type TelegramFormattingEntity = NonNullable<Parameters<Window['telegram']['send']>[3]>[number];
type TelegramFormattingEntities = NonNullable<Parameters<Window['telegram']['send']>[3]>;

export type SchedulerBridgeResult = {
  success: boolean;
  error?: string;
  alreadySent?: boolean;
  sentAt?: string;
  telegramMessageId?: string | number;
  telegramMessageIds?: Array<string | number>;
  confirmed?: boolean;
  operationIdentity?: string;
  id?: string | number;
};

type TelegramBridge = Window['telegram'];
type TelegramSchedulePayload = Parameters<TelegramBridge['schedule']>[0];
type TelegramScheduleOperation = Parameters<TelegramBridge['getScheduleIdentities']>[0][number];
type TelegramHistorySavePayload = Parameters<TelegramBridge['saveScheduleHistory']>[0];

function getBridge(): Window['telegram'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.telegram;
}

export async function waitForTelegramRateLimit() {
  const bridge = getBridge();
  if (!bridge || typeof bridge.waitForRateLimit !== 'function') {
    return { success: true };
  }
  return bridge.waitForRateLimit();
}

export async function loadScheduleHistory(scope: 'personal' | 'workspace') {
  const bridge = getBridge();
  if (!bridge || typeof bridge.loadScheduleHistory !== 'function') return undefined;
  return bridge.loadScheduleHistory(scope);
}

export function hasScheduleHistoryStorage(): boolean {
  const bridge = getBridge();
  return Boolean(bridge && typeof bridge.saveScheduleHistory === 'function');
}

export async function saveScheduleHistory(data: TelegramHistorySavePayload) {
  const bridge = getBridge();
  if (!bridge || typeof bridge.saveScheduleHistory !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }
  return bridge.saveScheduleHistory(data);
}

export async function getScheduleIdentities(operations: TelegramScheduleOperation[]) {
  const bridge = getBridge();
  if (!bridge || typeof bridge.getScheduleIdentities !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }
  return bridge.getScheduleIdentities(operations);
}

export async function scheduleTelegramMessage(data: TelegramSchedulePayload): Promise<SchedulerBridgeResult> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.schedule !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }
  return bridge.schedule(data);
}

function normalizeAttachments(attachments?: Array<DraftAttachment | string>): string[] {
  if (!attachments) return [];

  return attachments
    .map((attachment) => typeof attachment === 'string' ? attachment : attachment.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
}

function normalizeEntities(entities: PublishRequest['entities']): TelegramFormattingEntities {
  const supportedTypes = new Set<TelegramFormattingEntity['type']>([
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'text_url',
  ]);

  const normalized: TelegramFormattingEntities = [];
  for (const entity of entities ?? []) {
    if (!supportedTypes.has(entity.type as TelegramFormattingEntity['type'])) return [];
    const type = entity.type as TelegramFormattingEntity['type'];
    if (type === 'text_url') {
      if (typeof entity.url !== 'string') continue;
      normalized.push({ type, offset: entity.offset, length: entity.length, url: entity.url });
      continue;
    }
    normalized.push({ type, offset: entity.offset, length: entity.length });
  }
  return normalized;
}

function buildReplyMarkup(payload: PublishRequest): { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> } | undefined {
  if (payload.replyMarkup !== undefined) return payload.replyMarkup as { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> } | undefined;
  if (!payload.inlineButtons) return undefined;

  return {
    inline_keyboard: payload.inlineButtons as Array<Array<{ text: string; url?: string; callback_data?: string }>>,
  };
}

export async function sendNow(payload: PublishRequest): Promise<SchedulerBridgeResult> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.send !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }

  const entities = normalizeEntities(payload.entities);
  const replyMarkup = buildReplyMarkup(payload);

  return (await bridge.send(
    payload.chatId,
    payload.text,
    normalizeAttachments(payload.attachments),
    entities,
    replyMarkup,
    payload.silent ?? false,
    payload.effect,
    payload.accountId,
    payload.sendAttemptId,
  )) as unknown as SchedulerBridgeResult;
}

export async function scheduleMessage(payload: PublishRequest): Promise<SchedulerBridgeResult> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.schedule !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }

  const scheduledAt = payload.scheduledAt ?? (payload.targetTimestamp ? new Date(payload.targetTimestamp).toISOString() : undefined);
  if (!scheduledAt) {
    return { success: false, error: 'Schedule time is required.' };
  }

  const targetTimestamp = payload.targetTimestamp ?? Math.floor(new Date(scheduledAt).getTime() / 1000);
  if (Number.isNaN(targetTimestamp)) {
    return { success: false, error: 'Schedule time is invalid.' };
  }

  const entities = normalizeEntities(payload.entities);
  const replyMarkup = buildReplyMarkup(payload);

  return (await bridge.schedule({
    chatId: payload.chatId,
    message: payload.text,
    targetTimestamp,
    attachments: normalizeAttachments(payload.attachments),
    entities,
    replyMarkup,
    silent: payload.silent,
    effect: payload.effect,
    accountId: payload.accountId,
  })) as unknown as SchedulerBridgeResult;
}

export async function cancelScheduledMessage(data: {
  chatId: string;
  telegramMessageId?: string | number;
  telegramMessageIds?: Array<string | number>;
  message?: string;
  targetTimestamp?: number;
}): Promise<SchedulerBridgeResult> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.cancel !== 'function') {
    return { success: false, error: 'desktopBridgeRequired' };
  }

  return (await bridge.cancel(data)) as unknown as SchedulerBridgeResult;
}
