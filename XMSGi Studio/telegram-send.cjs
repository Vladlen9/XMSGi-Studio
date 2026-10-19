function createTelegramSender({
  Api,
  connectTelegram,
  getClient,
  getTelegramRequestTimeout,
  logTelegramOperation,
  normalizeTelegramMessage,
  prepareInlineKeyboard,
  telegramRequest,
  toTelegramFormattingEntities,
  withTelegramInvokeDiagnostics,
  withTimeout,
}) {
  return async function sendMessageInternal(
    chatId,
    message,
    attachments = [],
    entities = [],
    replyMarkup,
    silent = false,
    effect,
    idempotencyKey
  ) {
    const normalized = normalizeTelegramMessage(message, entities);
    message = normalized.message;
    entities = normalized.entities;

    if (!getClient()) {
      await connectTelegram();
    }

    const target = chatId === 'me' ? 'me' : chatId;
    const clientAtStart = getClient();

    try {
      const sendOptions = { message };

      if (silent) {
        sendOptions.silent = true;
      }

      if (effect !== undefined) {
        sendOptions.effect = BigInt(effect);
      }

      if (entities.length > 0) {
        sendOptions.formattingEntities = toTelegramFormattingEntities(entities);
      }

      if (attachments.length > 0) {
        sendOptions.file = attachments.length === 1 ? attachments[0] : attachments;
      }

      const preparedMarkup = prepareInlineKeyboard(replyMarkup);

      if (attachments.length > 0) {
        sendOptions.buttons = preparedMarkup;
      }

      const useDirectSendMessage = attachments.length === 0
        && typeof clientAtStart.getInputEntity === 'function'
        && typeof clientAtStart.invoke === 'function';
      const sendOperation = !useDirectSendMessage
        ? () => clientAtStart.sendMessage(target, sendOptions)
        : async () => {
          const peer = await clientAtStart.getInputEntity(target);
          const request = new Api.messages.SendMessage({
            peer,
            message,
            entities: sendOptions.formattingEntities,
            replyMarkup: preparedMarkup,
            silent: sendOptions.silent === true,
            ...(sendOptions.effect !== undefined ? { effect: sendOptions.effect } : {}),
          });
          const response = await clientAtStart.invoke(request);

          if (request.effect !== undefined) {
            const updates = Array.isArray(response?.updates) ? response.updates : [];
            const newMessageUpdate = updates.find((update) => update?.className === 'UpdateNewMessage');
            const messageEffect = newMessageUpdate?.message?.effect;

            if (newMessageUpdate) {
              console.error('[MESSAGE-EFFECT-RESPONSE-DEBUG]', {
                messageClassName: newMessageUpdate.message?.className,
                messageId: newMessageUpdate.message?.id,
                peerIdClassName: newMessageUpdate.message?.peerId?.className,
                effect: messageEffect === undefined
                  ? undefined
                  : typeof messageEffect === 'bigint'
                    ? `${messageEffect}n`
                    : String(messageEffect),
                effectClassName: messageEffect?.className,
                effectId: messageEffect?.effectId?.toString?.() ?? messageEffect?.effectId,
              });
            }
          }

          return response;
        };

      logTelegramOperation('send', message, attachments, replyMarkup);

      await withTelegramInvokeDiagnostics(clientAtStart, 'send', () => telegramRequest(() => withTimeout(
        sendOperation(),
        getTelegramRequestTimeout(attachments),
        attachments.length > 0 ? 'Sending Telegram media' : 'Sending Telegram message'
      )), idempotencyKey);

      if (getClient() !== clientAtStart) {
        throw new Error('Telegram send was cancelled.');
      }

      return true;
    } catch (error) {
      console.error('Telegram send failed:', {
        errorCode: error?.code || 'UNKNOWN',
        errorType: error?.name || 'Error',
        waitSeconds: Number.isFinite(error?.waitSeconds) ? error.waitSeconds : undefined,
      });

      throw error;
    }
  };
}

module.exports = { createTelegramSender };