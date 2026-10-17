<div align="center">

# XMSGi Studio

### ✈️ Telegram messages, when you choose.

<p>
  <a href="https://github.com/molodoy01/XMSGi-Studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/molodoy01/XMSGi-Studio?style=flat-square"></a>
  <a href="https://github.com/molodoy01/XMSGi-Studio/actions/workflows/release-check.yml"><img alt="Build" src="https://github.com/molodoy01/XMSGi-Studio/actions/workflows/release-check.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square"></a>
  <a href="https://github.com/molodoy01/XMSGi-Studio/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/molodoy01/XMSGi-Studio?style=flat-square"></a>
</p>

<img src="screenshots/01.png" alt="XMSGi Studio workspace" width="880" />

**XMSGi Studio** делает планирование встреч и создание публикаций в Telegram простым, локальным и **надежным**.

<br>

<a href="https://github.com/molodoy01/XMSGi-Studio/releases"><img alt="Download" src="https://img.shields.io/badge/⬇%20Download-v1.1.0-6c7cff?style=for-the-badge"></a>
&nbsp;
<a href="https://molodoy01.github.io/XMSGi-Studio/"><img alt="Website" src="https://img.shields.io/badge/Website-molodoy01.github.io-101218?style=for-the-badge"></a>
&nbsp;
<a href="https://github.com/molodoy01/XMSGi-Studio"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github"></a>

</div>

---

## ✨ Features

<table>
  <tr>
    <td width="50%" valign="top">
      <b>💬 Telegram, your way</b><br>
      Pick chats, groups and channels straight from your own account — no bot.
    </td>
    <td width="50%" valign="top">
      <b>⏰ Send now or later</b><br>
      One-time and future messages scheduled for a chosen date and time.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>✍️ Compose fully</b><br>
      Attachments, rich text formatting and inline buttons.
    </td>
    <td valign="top">
      <b>🗂️ Stay on top of it</b><br>
      Drafts, the scheduled queue and delivery outcomes in a single history.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>🔒 Private by design</b><br>
      Sessions stay on the device, protected with Electron <code>safeStorage</code>.
    </td>
    <td valign="top">
      <b>📦 Portable Windows build</b><br>
      No installation, no setup — runs from anywhere.
    </td>
  </tr>
</table>

## 🎛️ Control

Full control over every post in the queue — right up to the moment it's sent.

<table>
  <tr>
    <td width="50%" valign="top">
      <b>✏️ Edit before sending</b><br>
      Change the text and media of an already scheduled post — it goes out in the new version.
    </td>
    <td width="50%" valign="top">
      <b>🗓️ Reschedule or cancel</b><br>
      Shift the date and time or cancel delivery in one click.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>🔁 Repeats</b><br>
      Daily, by weekdays or monthly — up to 15 repeats.
    </td>
    <td valign="top">
      <b>📝 Templates</b><br>
      Frequent phrases in one click. Stored locally.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>🎨 Colored drafts</b><br>
      Organize ideas by color. Bring them back to the editor any time.
    </td>
    <td valign="top">
      <b>🚦 FloodWait auto-retry</b><br>
      On a Telegram flood limit the send pauses and retries by itself.
    </td>
  </tr>
</table>

## 🖼️ Screenshots

<p align="center">
  <img src="XMSGi%20Studio/website/screenshots/01.png" alt="XMSGi Studio workspace" width="32%" />
  <img src="XMSGi%20Studio/website/screenshots/02.png" alt="Telegram chat selection" width="32%" />
  <img src="XMSGi%20Studio/website/screenshots/03.png" alt="Message composition and preview" width="32%" />
</p>

## 📥 Download

| Platform | Format | Download |
| --- | --- | --- |
| Windows | Portable `.exe` | [XMSGi.Studio.1.1.0.exe](https://github.com/molodoy01/XMSGi-Studio/releases/download/v1.1.0/XMSGi.Studio.1.1.0.exe) — no installation required |
| Linux | AppImage (x64) | [XMSGi.Studio-1.1.0.AppImage](https://github.com/molodoy01/XMSGi-Studio/releases/download/v1.1.0/XMSGi.Studio-1.1.0.AppImage) |
| Linux | `.deb` (x64) | [xmsgi-studio_1.1.0_amd64.deb](https://github.com/molodoy01/XMSGi-Studio/releases/download/v1.1.0/xmsgi-studio_1.1.0_amd64.deb) |
| macOS | `.dmg` (Intel) | [XMSGi.Studio-1.1.0.dmg](https://github.com/molodoy01/XMSGi-Studio/releases/download/v1.1.0/XMSGi.Studio-1.1.0.dmg) |
| macOS | `.dmg` (Apple Silicon) | [XMSGi.Studio-1.1.0-arm64.dmg](https://github.com/molodoy01/XMSGi-Studio/releases/download/v1.1.0/XMSGi.Studio-1.1.0-arm64.dmg) |

All builds for v1.1.0 are also listed on the [GitHub Releases](https://github.com/molodoy01/XMSGi-Studio/releases/tag/v1.1.0) page.

## 🚀 Quick start

Requirements:

- Node.js 20+
- npm
- Windows for the packaged desktop experience

Run locally:

```bash
npm install
npm run build
npm run electron
```

Build a Windows release package:

```bash
npm run dist
```

<details>
<summary>🏗️ <b>Studio architecture</b> · for developers</summary>

The Electron host owns the window, Telegram session and IPC bridge. Studio and Quick Planner are pages in the same React application. Studio is composed in `XMSGi Studio/src/studio/App.tsx` and mounted through `XMSGi Studio/src/workspace/StudioMount.tsx` with the host-owned scheduler runtime.

Studio's internal feature structure lives under `XMSGi Studio/src/studio/`:

- `XMSGi Studio/src/studio/App.tsx` composes the workspace and scheduler.
- `XMSGi Studio/src/studio/pages/WorkspacePage.tsx` owns the workspace page.
- `XMSGi Studio/src/studio/components/stages/` contains the chat, schedule, draft, template and inline-button stages.
- `XMSGi Studio/src/studio/services/` adapts publishing operations to the Telegram runtime.
- `XMSGi Studio/packages/shared/` provides types, translations and utilities shared across the application.
- `XMSGi/telegram-errors.cjs` classifies Telegram errors; the account rate-limit interceptor waits and retries FloodWaits. IPC passes error category and retry metadata to Studio's operation-aware error handler.

Studio's locale context is provided by the host. Keep `StudioMount` under the host's `LocaleProvider`, and pass the existing connection, chats, account ID and scheduler runtime:

```tsx
<StudioMount
  connected={connected}
  activeAccountId={activeAccountId}
  chats={chats}
  scheduler={scheduler}
/>
```

The `@/`, `@studio/` and `@shared/` aliases are configured by the host Vite and TypeScript settings. Run `npm --prefix "XMSGi Studio" run typecheck`, `npm --prefix "XMSGi Studio" test` and `npm --prefix "XMSGi Studio" run build` from the repository root to validate the complete app, including Studio.

### Scheduler ownership

When Studio is embedded, the Host `useScheduler` runtime is authoritative for scheduling history, cancellation, retry state and FloodWait pauses. Studio receives that runtime through the versioned React-props contract in `packages/shared/bridge/`; History/Archive callbacks are part of the same contract. There is no separate event stream.

The Electron application always passes the host scheduler runtime, which is authoritative for scheduling history, cancellation, retry state and FloodWait pauses. `useStudioScheduler` remains a fallback for isolated previews and component tests.

</details>

## 📚 Documentation

Full documentation lives in the [`docs/`](XMSGi%20Studio/docs/README.md) directory:

- [User guide](XMSGi%20Studio/docs/ru/user-guide.md) — features, modes, installation, workflows (RU)
- [Architecture](XMSGi%20Studio/docs/ru/architecture.md) — process layers, modules, data flows (RU)
- [Development](XMSGi%20Studio/docs/ru/development.md) — setup, commands, tests, conventions (RU)
- [Security and privacy](XMSGi%20Studio/docs/ru/security.md) — storage, encryption, trust boundaries (RU)
- [IPC reference](XMSGi%20Studio/docs/ru/ipc-reference.md) — renderer ⇄ main channels (RU)

## 🔒 Security &amp; privacy

XMSGi Studio keeps Telegram data local to the device. Session and account data are stored in the user data directory, and secure storage is used where the platform supports it.

This app does not depend on a Telegram bot for its core scheduling flow.

## 🤝 Contributing

We welcome focused pull requests and bug reports. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

## 🛡️ Security reporting

Please report vulnerabilities privately through the repository security process. Do not disclose critical issues in public issues or pull requests. See [SECURITY.md](SECURITY.md).

## 📦 Repository

- Source code: https://github.com/molodoy01/XMSGi-Studio
- Website: https://molodoy01.github.io/XMSGi-Studio/

## 📄 License

This project is licensed under the MIT License. The canonical license text is in [LICENSE](LICENSE).

---
XMSGi Studio делает планирование встреч и создание публикаций в Telegram простым, локальным и надежным.
