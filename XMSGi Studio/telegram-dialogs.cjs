function getStableChatId(requestedId, entityId) {
  const id = requestedId ?? entityId;
  return id == null ? '' : String(id);
}

function normalizeDialogChats(dialogs, getChatType, getDisplayName) {
  const chatsById = new Map();

  for (const dialog of dialogs || []) {
    const id = getStableChatId(dialog?.id);
    if (!id) continue;

    const entity = dialog.entity || null;
    chatsById.set(id, {
      id,
      name: dialog.name || getDisplayName(entity) || id,
      username: entity?.username || '',
      type: getChatType(entity) || 'private'
    });
  }

  return [...chatsById.values()];
}

module.exports = { getStableChatId, normalizeDialogChats };