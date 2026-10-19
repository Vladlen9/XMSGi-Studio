import { describe, expect, it } from 'vitest';
import { Api } from 'teleproto';
import {
  getTelegramEntityIdentity,
  getTelegramEntityType,
  toTelegramFormattingEntities,
} from './telegram-message-entities.cjs';

describe('Telegram message entity mapping', () => {
  it('maps Telegram class names to editor entity types', () => {
    expect(getTelegramEntityType({ className: 'MessageEntityBold' })).toBe('bold');
    expect(getTelegramEntityType(new Api.MessageEntityTextUrl({ offset: 1, length: 4, url: 'https://example.com' })))
      .toBe('text_url');
    expect(getTelegramEntityType({ className: 'MessageEntityUnsupported' })).toBeNull();
  });

  it('normalizes Telegram entities for scheduled-message identity checks', () => {
    expect(getTelegramEntityIdentity([
      { className: 'MessageEntityBold', offset: 2, length: 5 },
      { className: 'MessageEntityTextUrl', offset: 8, length: 3, url: 'https://example.com' },
      { className: 'MessageEntityUnknown', offset: 12, length: 1 },
    ])).toEqual([
      { type: 'bold', offset: 2, length: 5 },
      { type: 'text_url', offset: 8, length: 3, url: 'https://example.com' },
      { type: 'MessageEntityUnknown', offset: 12, length: 1 },
    ]);
  });

  it('constructs Teleproto formatting entities and rejects unsupported types', () => {
    const entities = toTelegramFormattingEntities([
      { type: 'bold', offset: 1, length: 4 },
      { type: 'text_url', offset: 7, length: 3, url: 'https://example.com' },
    ]);

    expect(entities[0]).toBeInstanceOf(Api.MessageEntityBold);
    expect(entities[1]).toBeInstanceOf(Api.MessageEntityTextUrl);
    expect(entities[1].url).toBe('https://example.com');
    expect(() => toTelegramFormattingEntities([{ type: 'unsupported', offset: 0, length: 1 }]))
      .toThrow('Unsupported formatting entity.');
  });
});