const { Api } = require('teleproto');

const TELEGRAM_ENTITY_TYPES = {
  MessageEntityBold: 'bold',
  MessageEntityItalic: 'italic',
  MessageEntityUnderline: 'underline',
  MessageEntityStrike: 'strikethrough',
  MessageEntityTextUrl: 'text_url',
};

function getTelegramEntityType(entity) {
  const className = entity?.className || entity?.constructor?.name;
  return TELEGRAM_ENTITY_TYPES[className] ?? null;
}

function getTelegramEntityIdentity(entities = []) {
  return entities.map((entity) => {
    const type = getTelegramEntityType(entity);
    return type
      ? { type, offset: entity.offset, length: entity.length, ...(type === 'text_url' ? { url: entity.url } : {}) }
      : { type: entity.className || entity.constructor?.name || 'unknown', offset: entity.offset, length: entity.length };
  });
}

function toTelegramFormattingEntities(entities = []) {
  return entities.map((entity) => {
    const range = { offset: entity.offset, length: entity.length };
    switch (entity.type) {
      case 'bold': return new Api.MessageEntityBold(range);
      case 'italic': return new Api.MessageEntityItalic(range);
      case 'underline': return new Api.MessageEntityUnderline(range);
      case 'strikethrough': return new Api.MessageEntityStrike(range);
      case 'text_url': return new Api.MessageEntityTextUrl({ ...range, url: entity.url });
      default: throw new Error('Unsupported formatting entity.');
    }
  });
}

module.exports = { getTelegramEntityType, getTelegramEntityIdentity, toTelegramFormattingEntities };