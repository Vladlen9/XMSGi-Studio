const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const { resolveAppDataRoot } = require('./app-data-path.cjs');
const appIconPath = process.platform === 'win32'
  ? path.join(__dirname, 'build', 'icon.ico')
  : path.join(__dirname, 'src', 'studio', 'assets', 'logo.png');

const devServerEnabled = process.env.ELECTRON_DEV_SERVER === '1' || process.env.ELECTRON_DEV_SERVER === 'true';
const isolatedUserDataRoot = !app.isPackaged
  ? process.env.XMSGI_STUDIO_USER_DATA_DIR || (devServerEnabled
    ? path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'XMSGi-Workspace-Agent')
    : null)
  : null;
const writableAppDataRoot = isolatedUserDataRoot
  ? path.resolve(isolatedUserDataRoot)
  : resolveAppDataRoot(path, process.env.LOCALAPPDATA || app.getPath('appData'), app.isPackaged);
const writableCacheRoot = path.join(writableAppDataRoot, 'Cache');
const writableTempRoot = path.join(writableAppDataRoot, 'Temp');

fs.mkdirSync(writableAppDataRoot, { recursive: true });
fs.mkdirSync(writableCacheRoot, { recursive: true });
fs.mkdirSync(writableTempRoot, { recursive: true });

app.setPath('userData', writableAppDataRoot);
app.setPath('sessionData', writableAppDataRoot);
app.setPath('cache', writableCacheRoot);
app.setPath('temp', writableTempRoot);
app.commandLine.appendSwitch('disk-cache-dir', writableCacheRoot);
if (!app.isPackaged) {
  const remoteDebuggingPort = process.env.XMSGI_STUDIO_REMOTE_DEBUGGING_PORT || '9222';
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort);
}

if (!app.isPackaged && process.env.npm_lifecycle_event !== 'start') {
  const developmentEnvironment = {};
  require('dotenv').config({ processEnv: developmentEnvironment });
  for (const key of ['API_ID', 'API_HASH']) {
    if (process.env[key] === undefined && typeof developmentEnvironment[key] === 'string') {
      process.env[key] = developmentEnvironment[key];
    }
  }
}

const {
  validateCancelPayload,
  validateChatId,
  validateDeleteSavedMessagePayload,
  validateHistoryPayload,
  validateLoginPayload,
  validateTelegramCredentialsPayload,
  validateQuery,
  validateSchedulePayload,
  validateSendPayload,
  assertTrustedRenderer
} = require('./ipc-security.cjs');
const { readChats, writeChats, readJsonFile, writeJsonFile } = require('./chat-storage.cjs');
const { resolveAppDataPath } = require('./app-data-path.cjs');
const { normalizeScheduleMessages } = require('./schedule-history.cjs');
const draftStoreModulePath = (() => {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, 'draft-store.cjs') : null,
    path.resolve(__dirname, 'draft-store.cjs'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, 'draft-store.cjs');
})();
const { createDraftStore } = require(draftStoreModulePath);
const { classifyTelegramError } = require('./telegram-errors.cjs');

const userDataPath = app.getPath('userData');
const SECURE_CONFIG_PATH = resolveAppDataPath(
  fs,
  path,
  userDataPath,
  'xmsgi-studio-secure-config.json',
  'awaitmsg-secure-config.json',
);
const CHAT_STORAGE_PATH = resolveAppDataPath(
  fs,
  path,
  userDataPath,
  'xmsgi-studio-chats.json',
  'awaitmsg-chats.json',
);
const DRAFT_STORE_DIRECTORY = path.join(app.getPath('userData'), 'drafts');
const draftStore = createDraftStore({ directory: DRAFT_STORE_DIRECTORY });
const SCHEDULE_HISTORY_PATH = resolveAppDataPath(
  fs,
  path,
  userDataPath,
  'xmsgi-studio-schedule-history.json',
  'awaitmsg-schedule-history.json',
);

let mainWindow = null;
let tray = null;
let isQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on('second-instance', () => {
  showMainWindow();
  if (!app.isPackaged && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
});

function readSecureConfig() {
  try {
    const raw = fs.readFileSync(SECURE_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSecureConfig(data) {
  try {
    fs.writeFileSync(SECURE_CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Secure config write failed:', error?.code || error?.name || 'unknown');
  }
}

function removeObsoleteSecureConfigFields() {
  const config = readSecureConfig();
  let changed = false;
  for (const key of ['GEMINI_API_KEY_ENCRYPTED', 'AI_ASSISTANT_ENABLED']) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      delete config[key];
      changed = true;
    }
  }
  if (changed) writeSecureConfig(config);
}

removeObsoleteSecureConfigFields();

function shouldLoadProductionBuild() {
  const distIndexPath = path.join(__dirname, 'dist', 'index.html');
  const explicitDevMode = process.env.ELECTRON_DEV_SERVER === '1' || process.env.ELECTRON_DEV_SERVER === 'true';
  const explicitProdMode = process.env.ELECTRON_PROD_BUILD === '1' || process.env.ELECTRON_PROD_BUILD === 'true';

  if (app.isPackaged) {
    return true;
  }

  if (explicitDevMode) {
    return false;
  }

  if (explicitProdMode) {
    return true;
  }

  return fs.existsSync(distIndexPath);
}

function getAppUrl() {
  if (shouldLoadProductionBuild()) {
    return `file://${path.join(__dirname, 'dist', 'index.html')}`;
  }

  return 'http://localhost:5173';
}

function sendTelegramStatus(status) {

  if (
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {

    mainWindow.webContents.send(
      'telegram-status',
      status
    );

  }

}

const {
  connectTelegram,
  loginUser,
  saveTelegramApiCredentials,
  getTelegramConfig,
  signOutKeepSession,
  welcomeBack,
  forgetTelegramAccount,
  clearTelegramSession,
  getChats,
  getChatPermissions,
  getChatAvatar,
  getAccountAvatar,
  getChatHistory,
  deleteSavedMessage,
  getContacts,
  getAvailableEffects,
  resolveChat,
  getTelegramRateLimitState,
  getTelegramStatus,
  waitForTelegramRateLimit,
  sendMessage,
  getScheduleOperationIdentities,
  scheduleMessage,
  cancelScheduledMessage,
  shutdownTelegram,
  setTelegramStatusCallback
} = require('./telegram.cjs');
function telegramOperationFailure(error) {
  const classification = classifyTelegramError(error);
  const normalizedError = classification.error;
  const code = normalizedError?.code || error?.code;
  return {
    success: false,
    error: normalizedError?.message || 'Telegram request failed.',
    ...(code ? { code } : {}),
    category: classification.category,
    retryable: classification.retryable,
    ...(normalizedError?.waitSeconds === undefined ? {} : { waitSeconds: normalizedError.waitSeconds }),
    ...(classification.category === 'cancelled' ? { cancelled: true } : {}),
  };
}

setTelegramStatusCallback((status) => {
  sendTelegramStatus(status);
});

function getSafeTelegramAuthState() {
  const config = getTelegramConfig();
  const hasSession = Boolean(config.hasSession);
  const signedOut = Boolean(config.signedOut);
  const connected = Boolean(config.connected);

  return {
    hasSession,
    signedOut,
    connected,
    userName: config.userName || '',
    username: config.username || '',
    state: !hasSession
      ? 'NO_SESSION'
      : signedOut
        ? 'SIGNED_OUT'
        : connected
          ? 'CONNECTED'
          : 'DISCONNECTED'
  };
}

function createWindow() {
   mainWindow = new BrowserWindow({
    title: 'XMSGi Studio',
  icon: appIconPath,
    width: 900,
    height: 800,
    minWidth: 900,
    minHeight: 800,
    resizable: true,
    backgroundColor: '#11110f',
    autoHideMenuBar: true,
    show: false,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://aistudio.google.com/app/apikey') {
      shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  mainWindow.webContents.session.setSpellCheckerLanguages(['ru-RU', 'en-US']);

  const appUrl = getAppUrl();

  if (shouldLoadProductionBuild()) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(appUrl);
  }
}

function requestQuit() {
  if (isQuitting) return;

  isQuitting = true;

  if (tray) {
    tray.destroy();
    tray = null;
  }

  console.log('XMSGi Studio shutting down.');

  shutdownTelegram()
    .catch((error) => {
      console.error('Telegram shutdown error:', error?.code || error?.name || 'unknown');
    })
    .finally(() => {
      console.log('XMSGi Studio shutdown complete.');
      app.quit();
    });
}

function createTray() {
  if (tray) return;

  tray = new Tray(appIconPath);
  tray.setToolTip('XMSGi Studio');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'XMSGi Studio', enabled: false },
    { type: 'separator' },
    { label: 'Open XMSGi Studio', click: showMainWindow },
    { label: 'Exit', click: requestQuit },
  ]));
  tray.on('double-click', showMainWindow);
}

ipcMain.handle('chat-storage-load', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  return readChats(CHAT_STORAGE_PATH);
});

ipcMain.handle('chat-storage-save', async (event, chats) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  writeChats(CHAT_STORAGE_PATH, chats);
  return { success: true };
});

function assertDraftStorageRenderer(event) {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
}

const DRAFT_STORE_SCHEMA_VERSION = 3;
const DOCUMENT_HISTORY_REASONS = new Set([
  'edit',
  'before-clear',
  'before-delete',
  'before-replacement',
  'before-attachment-removal',
  'restore',
  'publish',
]);

function isPersistedSavedDraft(value) {
  return Boolean(value && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.body === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string');
}

function normalizeDocumentHistories(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const [documentId, rawVersions] of Object.entries(value)) {
    if (!documentId || !Array.isArray(rawVersions)) continue;
    const versions = rawVersions.filter((version) => (
      version
      && typeof version === 'object'
      && !Array.isArray(version)
      && version.documentId === documentId
      && typeof version.id === 'string'
      && version.id.length > 0
      && typeof version.createdAt === 'string'
      && Number.isFinite(Date.parse(version.createdAt))
      && DOCUMENT_HISTORY_REASONS.has(version.reason)
      && version.snapshot
      && typeof version.snapshot === 'object'
      && !Array.isArray(version.snapshot)
      && typeof version.snapshot.body === 'string'
      && Array.isArray(version.snapshot.attachments)
      && (!version.snapshot.documentId || version.snapshot.documentId === documentId)
    ));
    if (versions.length) normalized[documentId] = versions.slice(-30);
  }
  return normalized;
}

function normalizeDraftStoreResult(value, { migrationVersionFallback = 0, migrated = false } = {}) {
  const response = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const raw = response.store && typeof response.store === 'object' && !Array.isArray(response.store)
    ? response.store
    : response;
  const savedDraftSource = Array.isArray(raw.savedDrafts)
    ? raw.savedDrafts
    : Array.isArray(raw.drafts)
      ? raw.drafts
      : [];
  const savedDrafts = savedDraftSource.filter(isPersistedSavedDraft);
  const migrationVersion = Number.isInteger(raw.migrationVersion)
    ? raw.migrationVersion
    : Array.isArray(raw.savedDrafts)
      ? 1
      : migrationVersionFallback;
  const store = {
    schemaVersion: Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : DRAFT_STORE_SCHEMA_VERSION,
    migrationVersion,
    savedDrafts,
    workspaceDraft: raw.workspaceDraft && typeof raw.workspaceDraft === 'object' && !Array.isArray(raw.workspaceDraft)
      ? raw.workspaceDraft
      : null,
    documentHistories: normalizeDocumentHistories(raw.documentHistories),
  };

  return {
    success: response.success !== false,
    store,
    needsMigration: response.needsMigration ?? (!migrated && migrationVersion < 1),
    migrated: response.migrated ?? migrated,
    recovered: response.recovered ?? false,
    backupIndexes: Array.isArray(response.backupIndexes)
      ? response.backupIndexes
      : Array.isArray(raw.backups)
        ? raw.backups.map((_, index) => index)
        : [],
    ...(response.cancelled === true ? { cancelled: true } : {}),
    ...(typeof response.error === 'string' ? { error: response.error } : {}),
  };
}

const SCHEDULE_HISTORY_SCOPES = new Set(['personal', 'workspace']);
const SCHEDULE_HISTORY_FIELDS = new Set(['upcoming', 'sent', 'snapshot']);

ipcMain.handle('schedule-history:load', (event, scope) => {
  assertDraftStorageRenderer(event);
  if (!SCHEDULE_HISTORY_SCOPES.has(scope)) return { success: false, error: 'Schedule history scope is invalid.' };

  const exists = fs.existsSync(SCHEDULE_HISTORY_PATH);
  const store = readJsonFile(SCHEDULE_HISTORY_PATH, null);
  if (exists && (!store || typeof store !== 'object' || Array.isArray(store))) {
    return { success: false, error: 'Schedule history could not be read.' };
  }

  try {
    const scopeStore = store?.[scope];
    const history = {
      upcoming: normalizeScheduleMessages(scopeStore?.upcoming ?? [], { recoverInterrupted: true }),
      sent: normalizeScheduleMessages(scopeStore?.sent ?? [], { recoverInterrupted: true }),
    };
    return { success: true, history, needsMigration: !scopeStore };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Schedule history could not be read.' };
  }
});

ipcMain.handle('schedule-history:save', (event, data = {}) => {
  assertDraftStorageRenderer(event);
  const { scope, field, messages } = data;
  if (!SCHEDULE_HISTORY_SCOPES.has(scope) || !SCHEDULE_HISTORY_FIELDS.has(field)) {
    return { success: false, error: 'Schedule history destination is invalid.' };
  }

  try {
    const exists = fs.existsSync(SCHEDULE_HISTORY_PATH);
    const current = readJsonFile(SCHEDULE_HISTORY_PATH, null);
    if (exists && (!current || typeof current !== 'object' || Array.isArray(current))) {
      throw new Error('Existing schedule history could not be read.');
    }
    const validatedMessages = field === 'snapshot'
      ? {
        upcoming: normalizeScheduleMessages(messages?.upcoming),
        sent: normalizeScheduleMessages(messages?.sent),
      }
      : normalizeScheduleMessages(messages);
    if (Buffer.byteLength(JSON.stringify(validatedMessages), 'utf8') > 8 * 1024 * 1024) {
      throw new Error('Schedule history exceeds the supported size.');
    }
    const scopeHistory = current?.[scope] && typeof current[scope] === 'object'
      ? current[scope]
      : { upcoming: [], sent: [] };
    writeJsonFile(SCHEDULE_HISTORY_PATH, {
      schemaVersion: 1,
      ...(current ?? {}),
      [scope]: field === 'snapshot'
        ? validatedMessages
        : { ...scopeHistory, [field]: validatedMessages },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Schedule history could not be saved.' };
  }
});

ipcMain.handle('draft-store:load', (event) => {
  assertDraftStorageRenderer(event);
  try {
    return normalizeDraftStoreResult(draftStore.load());
  } catch (error) {
    return {
      success: false,
      backupIndexes: [],
      error: error instanceof Error ? error.message : 'Saved drafts could not be loaded.',
    };
  }
});

ipcMain.handle('draft-store:migrate', (event, legacy) => {
  assertDraftStorageRenderer(event);
  try {
    const existing = draftStore.load();
    const savedDrafts = new Map();
    const existingDrafts = Array.isArray(existing.savedDrafts)
      ? existing.savedDrafts
      : Array.isArray(existing.drafts)
        ? existing.drafts
        : [];
    [...existingDrafts, ...(Array.isArray(legacy?.savedDrafts) ? legacy.savedDrafts : [])]
      .filter(isPersistedSavedDraft)
      .forEach((draft) => savedDrafts.set(draft.id, draft));
    const data = draftStore.migrate({
      ...existing,
      ...(legacy && typeof legacy === 'object' ? legacy : {}),
      schemaVersion: DRAFT_STORE_SCHEMA_VERSION,
      migrationVersion: 1,
      savedDrafts: [...savedDrafts.values()],
      workspaceDraft: legacy?.workspaceDraft ?? existing.workspaceDraft ?? null,
    });

    return normalizeDraftStoreResult(data, { migrationVersionFallback: 1, migrated: true });
  } catch (error) {
    return {
      success: false,
      backupIndexes: [],
      error: error instanceof Error ? error.message : 'Saved drafts could not be migrated.',
    };
  }
});

ipcMain.handle('draft-store:save', async (event, data) => {
  assertDraftStorageRenderer(event);
  try {
    const normalized = normalizeDraftStoreResult(data).store;
    return { success: true, store: await draftStore.save(normalized) };
  } catch (error) {
    return { success: false, code: 'WRITE_FAILED', error: error instanceof Error ? error.message : 'Drafts could not be saved.' };
  }
});

ipcMain.on('draft-store:flush', (event, data) => {
  try {
    assertDraftStorageRenderer(event);
    event.returnValue = { success: true, store: draftStore.saveSync(data) };
  } catch (error) {
    event.returnValue = { success: false, code: 'WRITE_FAILED', error: error instanceof Error ? error.message : 'Drafts could not be saved before closing.' };
  }
});

ipcMain.handle('draft-store:restore-backup', (event, index) => {
  assertDraftStorageRenderer(event);
  try {
    return normalizeDraftStoreResult(draftStore.restoreBackup(index));
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'The draft backup could not be restored.',
    };
  }
});

ipcMain.handle('draft-store:copy-attachment', (event, sourcePath) => {
  assertDraftStorageRenderer(event);
  return draftStore.copyAttachment(sourcePath);
});

ipcMain.handle('draft-store:write-attachment', (event, payload) => {
  assertDraftStorageRenderer(event);
  return draftStore.writeAttachment(payload?.name, payload?.bytes);
});

ipcMain.handle('draft-store:export', async (event) => {
  assertDraftStorageRenderer(event);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(owner, {
    title: 'Export Saved Drafts',
    defaultPath: 'xmsgi-studio-drafts-backup.json',
    filters: [{ name: 'JSON backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, cancelled: true };
  return draftStore.exportTo(result.filePath);
});

ipcMain.handle('draft-store:import', async (event) => {
  assertDraftStorageRenderer(event);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const selection = await dialog.showOpenDialog(owner, {
    title: 'Import Saved Drafts',
    properties: ['openFile'],
    filters: [{ name: 'JSON backup', extensions: ['json'] }],
  });
  if (selection.canceled || !selection.filePaths[0]) return { success: false, cancelled: true };

  const choice = await dialog.showMessageBox(owner, {
    type: 'question',
    title: 'Import Saved Drafts',
    message: 'Choose how to import this backup.',
    detail: 'Merge keeps existing drafts and updates matching IDs. Replace overwrites the current library.',
    buttons: ['Merge', 'Replace', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 2) return { success: false, cancelled: true };
  const result = draftStore.importFrom(selection.filePaths[0], choice.response === 0 ? 'merge' : 'replace');
  return normalizeDraftStoreResult(result);
});

ipcMain.handle('editor-text:export', async (event, payload) => {
  assertDraftStorageRenderer(event);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const isStructured = payload !== null && typeof payload === 'object';
  const text = isStructured ? payload.text : payload;
  const format = isStructured && payload.format === 'json' ? 'json' : 'txt';
  const result = await dialog.showSaveDialog(owner, {
    title: 'Export editor text',
    defaultPath: format === 'json' ? 'message.json' : 'message.txt',
    filters: format === 'json'
      ? [{ name: 'JSON document', extensions: ['json'] }]
      : [{ name: 'Text document', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, cancelled: true };
  return draftStore.exportTextTo(result.filePath, text);
});

ipcMain.handle('editor-text:import', async (event) => {
  assertDraftStorageRenderer(event);
  const owner = BrowserWindow.fromWebContents(event.sender);
  const selection = await dialog.showOpenDialog(owner, {
    title: 'Import text into editor',
    properties: ['openFile'],
    filters: [{ name: 'Text document', extensions: ['txt'] }],
  });
  if (selection.canceled || !selection.filePaths[0]) return { success: false, cancelled: true };
  return draftStore.importTextFrom(selection.filePaths[0]);
});

ipcMain.handle('telegram-connect', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    await connectTelegram();
    return { success: true };
  } catch (error) {
    console.error('Telegram connection error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-config', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const config = getTelegramConfig();
    return {
      success: true,
      config: {
        hasCredentials: Boolean(config.hasCredentials),
        hasSession: Boolean(config.hasSession),
        connected: Boolean(config.connected),
        signedOut: Boolean(config.signedOut)
      }
    };
  } catch (error) {
    console.error('Telegram config read error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-save-credentials', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );

  const validated = validateTelegramCredentialsPayload(data);

  try {
    const result = saveTelegramApiCredentials(validated);

    if (!result.saved) {
      return { success: false, error: 'Telegram API credentials could not be saved securely.' };
    }

    return {
      success: true,
      config: {
        hasCredentials: Boolean(result.config?.hasCredentials),
        hasSession: Boolean(result.config?.hasSession),
        connected: Boolean(result.config?.connected),
        signedOut: Boolean(result.config?.signedOut)
      }
    };
  } catch (error) {
    console.error('Telegram credentials save error:', error?.code || error?.name || 'unknown');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Telegram API credentials could not be saved securely.'
    };
  }
});

ipcMain.handle('telegram-auth-state', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    return { success: true, authState: getSafeTelegramAuthState() };
  } catch (error) {
    console.error('Telegram auth state error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-rate-limit-state', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  return getTelegramRateLimitState();
});

ipcMain.handle('telegram-status', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  return getTelegramStatus();
});

ipcMain.handle('telegram-wait-for-rate-limit', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    return await waitForTelegramRateLimit();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Telegram is not ready to resume requests.'
    };
  }
});

ipcMain.handle('telegram-sign-out-keep-session', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    await signOutKeepSession();
    return { success: true, authState: getSafeTelegramAuthState() };
  } catch (error) {
    console.error('Telegram sign out error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-welcome-back', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    await welcomeBack();
    return { success: true, authState: getSafeTelegramAuthState() };
  } catch (error) {
    console.error('Telegram Welcome Back error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-forget-account', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    await forgetTelegramAccount();
    return { success: true, authState: getSafeTelegramAuthState() };
  } catch (error) {
    console.error('Telegram account removal error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-clear-session', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const result = await clearTelegramSession();
    return { success: true, ...result };
  } catch (error) {
    console.error('Telegram clear session error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-login', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateLoginPayload(data);

  try {
    const result = await loginUser(validated);
    return {
      success: true,
      requiresCode: result.requiresCode === true,
      requiresPassword: result.requiresPassword === true,
      nextStep: result.nextStep,
      isCodeViaApp: result.isCodeViaApp === true
    };
  } catch (error) {
    console.error('Telegram login error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-chats', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const chats = await getChats();
    return { success: true, chats };
  } catch (error) {
    console.error('Telegram chats error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-chat-avatar', async (event, chatId) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedChatId = validateChatId(chatId);

  try {
    return { success: true, avatarDataUrl: await getChatAvatar(validatedChatId) };
  } catch (error) {
    console.error('Telegram chat avatar error:', error?.code || error?.name || 'unknown');
    return { success: false, avatarDataUrl: '', error: error.message };
  }
});

ipcMain.handle('telegram-account-avatar', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );

  try {
    return { success: true, avatarDataUrl: await getAccountAvatar() };
  } catch (error) {
    console.error('Telegram account avatar error:', error?.code || error?.name || 'unknown');
    return { success: false, avatarDataUrl: '', error: error.message };
  }
});

ipcMain.handle('telegram-chat-permissions', async (event, chatId) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedChatId = validateChatId(chatId);

  try {
    return { success: true, permissions: await getChatPermissions(validatedChatId) };
  } catch (error) {
    console.error('Telegram chat permissions error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-chat-history', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateHistoryPayload(data);

  try {
    return {
      success: true,
      history: await getChatHistory(validated.chatId, validated.limit)
    };
  } catch (error) {
    console.error('Telegram chat history error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-saved-message:delete', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateDeleteSavedMessagePayload(data);

  try {
    return await deleteSavedMessage(validated.chatId, validated.messageId);
  } catch (error) {
    console.error('Telegram saved message deletion error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

// -------------------------
// Telegram contacts
// -------------------------

ipcMain.handle('telegram-contacts', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const contacts = await getContacts();

    return {
      success: true,
      contacts
    };

  } catch (error) {
    console.error('Telegram contacts error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('telegram-effects', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const effects = await getAvailableEffects();
    return {
      success: true,
      effects
    };
  } catch (error) {
    console.error('Telegram effects error:', error?.code || error?.name || 'unknown');
    return {
      success: false,
      error: error.message
    };
  }
});

// -------------------------
// Find Telegram chat
// -------------------------

ipcMain.handle('telegram-find-chat', async (event, query) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedQuery = validateQuery(query);

  try {
    const chat = await resolveChat(validatedQuery);

    return {
      success: true,
      chat
    };

  } catch (error) {
    console.error('Telegram find chat error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});


// -------------------------
// Send message
// -------------------------

ipcMain.handle('telegram-send', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateSendPayload(data);

  try {
    await sendMessage(
      validated.chatId,
      validated.message,
      validated.attachments,
      validated.entities,
      validated.replyMarkup,
      validated.silent,
      validated.effect,
      validated.idempotencyKey
    );

    return {
      success: true
    };

  } catch (error) {
    console.error('Telegram send error:', error?.code || error?.name || 'unknown');
    return {
      ...telegramOperationFailure(error),
      ...(error.telegramMessageId === undefined ? {} : { telegramMessageId: error.telegramMessageId }),
      ...(error.telegramMessageIds === undefined ? {} : { telegramMessageIds: error.telegramMessageIds }),
    };
  }
});


ipcMain.handle('telegram-schedule-identities', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );

  if (!data || !Array.isArray(data.operations) || data.operations.length > 2015) {
    return { success: false, error: 'Schedule identity request is invalid.' };
  }

  try {
    const operations = data.operations.map(validateSchedulePayload);
    return {
      success: true,
      identities: await getScheduleOperationIdentities(operations),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Schedule identity could not be created.',
    };
  }
});


// -------------------------
// Schedule message
// -------------------------

ipcMain.handle('telegram-schedule', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateSchedulePayload(data);

  try {
    const result = await scheduleMessage(
      validated.chatId,
      validated.message,
      undefined,
      undefined,
      validated.targetTimestamp,
      validated.attachments,
      validated.entities,
      validated.replyMarkup,
      validated.silent,
      validated.effect
    );

    return {
      success: true,
      telegramMessageId: result.telegramMessageId ?? result.id,
      telegramMessageIds: result.telegramMessageIds,
      confirmed: result.confirmed === true,
      operationIdentity: result.operationIdentity,
    };

  } catch (error) {
    console.error('Schedule error:', error?.code || error?.name || 'unknown');
    return {
      ...telegramOperationFailure(error),
      ...(error.telegramMessageId === undefined ? {} : { telegramMessageId: error.telegramMessageId }),
      ...(error.telegramMessageIds === undefined ? {} : { telegramMessageIds: error.telegramMessageIds }),
    };
  }
});

// -------------------------
// Cancel scheduled message
// -------------------------

ipcMain.handle('telegram-cancel', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateCancelPayload(data);

  try {
    const result = await cancelScheduledMessage(
      validated.chatId,
      validated.telegramMessageIds ?? validated.telegramMessageId,
      validated.message,
      validated.targetTimestamp
    );

    return {
      success: true,
      ...(result && typeof result === 'object' ? result : {})
    };

  } catch (error) {
    console.error('Cancel error:', error?.code || error?.name || 'unknown');
    return telegramOperationFailure(error);
  }
});

// -------------------------
// App
// -------------------------

app.whenReady().then(() => {

  console.log('XMSGi Studio started.');
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath);
  }
  createWindow();
  createTray();

  app.on('activate', () => {

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }

    createTray();

  });

});


app.on('window-all-closed', () => {
  // Closing the window is handled by mainWindow.close and keeps the app in the tray.
});

app.on('before-quit', (event) => {
  if (isQuitting) return;

  event.preventDefault();
  requestQuit();
});

app.on('will-quit', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
