import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const mainSource = fs.readFileSync(path.join(projectRoot, 'main.cjs'), 'utf8');

describe('Electron tray lifecycle contract', () => {
  it('creates one tray with Open and Exit actions', () => {
    expect(mainSource).toContain('if (tray) return;');
    expect(mainSource).toContain("new Tray(path.join(__dirname, 'build', 'icon.ico'))");
    expect(mainSource).toContain("label: 'Open XMSGi Studio'");
    expect(mainSource).toContain("label: 'Exit'");
    expect(mainSource).toContain("tray.on('double-click', showMainWindow)");
  });

  it('keeps a practical desktop minimum size for both product views', () => {
    expect(mainSource).toContain('width: 900');
    expect(mainSource).toContain('minWidth: 780');
    expect(mainSource).toContain('minHeight: 560');
    expect(mainSource).toContain('resizable: true');
  });

  it('opens the CDP endpoint only for unpackaged Electron development', () => {
    expect(mainSource).toContain("if (!app.isPackaged) {");
    expect(mainSource).toContain("app.commandLine.appendSwitch('remote-debugging-port', '9222')");
  });

  it('hides the window on close while preserving the Telegram lifecycle', () => {
    expect(mainSource).toContain("mainWindow.on('close'");
    expect(mainSource).toContain('event.preventDefault();');
    expect(mainSource).toContain('mainWindow.hide();');
    expect(mainSource).toContain('Closing the window is handled by mainWindow.close');
  });

  it('routes the real exit through one guarded shutdown path', () => {
    expect(mainSource).toContain('function requestQuit()');
    expect(mainSource).toContain('isQuitting = true;');
    expect(mainSource).toContain('shutdownTelegram()');
    expect(mainSource).toContain('app.quit();');
    expect(mainSource).toContain("app.on('will-quit'");
  });

  it('does not shut down Telegram when the window is only closed to tray', () => {
    expect(mainSource).toContain('if (isQuitting) return;');
    expect(mainSource).toContain('event.preventDefault();');
    expect(mainSource).toContain('mainWindow.hide();');
    expect(mainSource).not.toMatch(/mainWindow\.on\('close'[\s\S]{0,500}shutdownTelegram\(\)/);
  });

  it('guards tray creation and second-instance reuse', () => {
    expect(mainSource).toContain('if (tray) return;');
    expect(mainSource).toContain("app.on('second-instance'");
    expect(mainSource).toContain('showMainWindow();');
  });

  it('focuses the existing window for a second instance', () => {
    expect(mainSource).toContain("app.on('second-instance'");
    expect(mainSource).toContain('showMainWindow();');
  });

  it('reloads the existing renderer for a rebuilt development instance only', () => {
    const secondInstanceHandler = mainSource.match(/app\.on\('second-instance',[\s\S]*?\n\}\);/)?.[0];

    expect(secondInstanceHandler).toContain('if (!app.isPackaged && mainWindow && !mainWindow.isDestroyed())');
    expect(secondInstanceHandler).toContain('mainWindow.webContents.reload();');
  });
});