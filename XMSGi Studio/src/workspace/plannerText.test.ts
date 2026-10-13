import { describe, expect, it } from 'vitest';
import { hasPlannerPayloadContent } from './plannerText';

describe('hasPlannerPayloadContent', () => {
  it('accepts text-only and attachment-only planner payloads', () => {
    expect(hasPlannerPayloadContent({ text: 'A note', attachments: [] })).toBe(true);
    expect(hasPlannerPayloadContent({ text: '  ', attachments: ['C:/notes/image.png'] })).toBe(true);
  });

  it('rejects payloads without text or a usable attachment', () => {
    expect(hasPlannerPayloadContent({ text: '  ', attachments: [] })).toBe(false);
    expect(hasPlannerPayloadContent({ text: '', attachments: ['  '] })).toBe(false);
  });
});