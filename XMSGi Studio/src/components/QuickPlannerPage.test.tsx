import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { SAVED_PLANNER_DRAFTS_UPDATED_EVENT, SAVED_PLANNER_DRAFT_STORAGE_KEY } from '@/lib/plannerDraft';
import { EDITOR_APPEARANCE_STORAGE_KEY, writeEditorAppearancePreferences } from '@shared/editorAppearance';
import type { ScheduledMessage } from '@/types';
import { normalizeScheduledMessages } from '@/workspace/historyModel';
import { QuickPlannerNavigationContext, type QuickPlannerNavigationActions } from '@/workspace/QuickPlannerNavigationContext';
import { QuickPlannerPage } from './QuickPlannerPage';

const plannerStyles = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'QuickPlannerPage.css'),
  'utf8',
);
const applicationStyles = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../index.css'),
  'utf8',
);
const savedPlannerDraftStorageKey = SAVED_PLANNER_DRAFT_STORAGE_KEY;
const plannerPreviewStorageKey = 'xmsgi-quick-planner-preview-state';

function getCssRules(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...plannerStyles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map(([, declarations]) => declarations);
}

function renderQuickPlanner(
  overrides: Partial<ComponentProps<typeof QuickPlannerPage>> = {},
  navigationActions?: QuickPlannerNavigationActions,
) {
  const props: ComponentProps<typeof QuickPlannerPage> = {
    chats: [{ id: 'chat-1', name: 'Test chat' }],
    selectedChat: { id: 'chat-1', name: 'Test chat' },
    selectedChatPermissions: null,
    onSelectChat: vi.fn(),
    onAddChat: vi.fn(),
    onRemoveChat: vi.fn(),
    message: '',
    onMessageChange: vi.fn(),
    entities: [],
    onEntitiesChange: vi.fn(),
    attachments: [],
    onAttachmentsChange: vi.fn(),
    upcoming: [],
    isSending: false,
    isScheduling: false,
    onSendNow: vi.fn().mockResolvedValue(true),
    onSchedule: vi.fn().mockResolvedValue(undefined),
    onSaveDraft: vi.fn(),
    onOpenInStudio: vi.fn(),
    ...overrides,
  };
  let updateUpcoming: ((upcoming: ScheduledMessage[]) => void) | undefined;
  let updateSelectedChat: ((chat: ComponentProps<typeof QuickPlannerPage>['selectedChat']) => void) | undefined;
  let updateSentHistory: ((history: ComponentProps<typeof QuickPlannerPage>['sentHistory']) => void) | undefined;
  const Harness = () => {
    const [message, setMessage] = useState(props.message);
    const [entities, setEntities] = useState(props.entities);
    const [attachments, setAttachments] = useState(props.attachments);
    const [selectedChat, setSelectedChat] = useState(props.selectedChat);
    const [upcoming, setUpcoming] = useState(props.upcoming);
    const [sentHistory, setSentHistory] = useState(props.sentHistory);
    updateSelectedChat = setSelectedChat;
    updateUpcoming = setUpcoming;
    updateSentHistory = setSentHistory;
    return (
      <LocaleProvider>
        <QuickPlannerPage
          {...props}
          selectedChat={selectedChat}
          onSelectChat={(chat) => {
            props.onSelectChat(chat);
            setSelectedChat(chat);
          }}
          upcoming={upcoming}
          sentHistory={sentHistory}
          message={message}
          entities={entities}
          attachments={attachments}
          onMessageChange={(nextMessage) => {
            props.onMessageChange(nextMessage);
            setMessage(nextMessage);
          }}
          onEntitiesChange={(nextEntities) => {
            props.onEntitiesChange(nextEntities);
            setEntities(nextEntities);
          }}
          onAttachmentsChange={(nextAttachments) => {
            props.onAttachmentsChange(nextAttachments);
            setAttachments(nextAttachments);
          }}
        />
      </LocaleProvider>
    );
  };
  const view = render(navigationActions ? (
    <QuickPlannerNavigationContext.Provider value={navigationActions}>
      <Harness />
    </QuickPlannerNavigationContext.Provider>
  ) : <Harness />);
  return {
    ...view,
    updateSelectedChat: (chat: ComponentProps<typeof QuickPlannerPage>['selectedChat']) => updateSelectedChat?.(chat),
    updateUpcoming: (upcoming: ScheduledMessage[]) => updateUpcoming?.(upcoming),
    updateSentHistory: (history: ComponentProps<typeof QuickPlannerPage>['sentHistory']) => updateSentHistory?.(history),
  };
}

function selectDraftMode() {
  fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
}

beforeEach(() => {
  localStorage.removeItem(plannerPreviewStorageKey);
  localStorage.removeItem(EDITOR_APPEARANCE_STORAGE_KEY);
  localStorage.removeItem('xmsgi-quick-planner-reminder-type');
  localStorage.removeItem('xmsgi-quick-planner-saved-draft');
});

describe('QuickPlannerPage layout positioning', () => {
  it('formats the top-left Planner clock in 24-hour time', () => {
    const { container } = renderQuickPlanner();
    const clock = container.querySelector('.quick-planner-clock-time time');

    expect(clock?.textContent).toMatch(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  });

  it('syncs the planner mode with the external current action and reports mode changes', () => {
    const onCurrentActionChange = vi.fn();
    renderQuickPlanner({
      currentAction: 'draft',
      onCurrentActionChange,
    });

    expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    expect(onCurrentActionChange).toHaveBeenCalledWith('send');
  });

  it('scales the entire Electron Planner like Studio while retaining its compact layout rules', () => {
    expect(applicationStyles).toMatch(/html\.electron-runtime\s*\{[^}]*--electron-ui-scale:\s*clamp\(0\.7,\s*min\(100vw \/ 900px,\s*100dvh \/ 800px\),\s*1\);[^}]*zoom:\s*var\(--electron-ui-scale\)/);
    expect(applicationStyles).not.toMatch(/html\.electron-runtime:has\(\.product-shell\.planner-shell \.quick-planner-page\)\s*\{/);
    expect(applicationStyles).not.toMatch(/planner-header-scale/);
    expect(applicationStyles).toMatch(/html\.electron-runtime \.product-shell\.planner-shell:has\(\.quick-planner-page\) > \.product-shell-content\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden/);
    expect(applicationStyles).toMatch(/html\.electron-runtime \.product-shell\.planner-shell:has\(\.quick-planner-page\) > \.product-shell-content > \.product-view\.is-active\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden/);
  });

  it('hides the empty Queue panel and right-side navigation', () => {
    localStorage.setItem(plannerPreviewStorageKey, JSON.stringify({
      publishMode: 'schedule',
      queuePreviewGroups: [],
    }));
    const { container } = renderQuickPlanner();

    expect(container.querySelector('.quick-planner-layout')).toHaveClass('is-queue-empty');
    expect(container.querySelector('.quick-planner-upcoming-column')).not.toBeInTheDocument();
    expect(container.querySelector('.quick-planner-sidebar')).toBeInTheDocument();
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar\s*\{[^}]*display:\s*none;/);
    expect(plannerStyles).toMatch(/\.quick-planner-upcoming-column\s*\{[^}]*display:\s*none;/);
    expect(screen.queryByText('No sent messages yet.')).not.toBeInTheDocument();
  });

  it('hides the right column below the comfortable Electron two-column width', () => {
    expect(plannerStyles).toMatch(/\.quick-planner-page\s*\{[^}]*container-name:\s*quick-planner;[^}]*container-type:\s*inline-size;/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*850px\)[\s\S]*?\.quick-planner-layout\s*\{[^}]*grid-template-areas:\s*"editor";[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(plannerStyles).toMatch(/\.quick-planner-upcoming-column,[\s\S]*?\.quick-planner-sidebar\s*\{[^}]*display:\s*none;/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-editor\s*\{[^}]*justify-self:\s*center;[^}]*width:\s*min\(100%,\s*800px\)/);
    expect(plannerStyles).toMatch(/@container quick-planner \(min-width:\s*851px\) and \(max-width:\s*1200px\)[\s\S]*?\.quick-planner-mode-switch button\s*\{[^}]*font-size:\s*16px/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch button\s*\{[^}]*font-size:\s*22px/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?\.quick-planner-mode-switch > \.quick-planner-mode-caption\s*\{[^}]*font-size:\s*12px/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-tools\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-quick-values\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*margin:\s*0/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-quick-values button\s*\{[^}]*font-size:\s*12px/);
  });

  it('anchors the Electron text field below chat selection at a 100px default height', () => {
    expect(plannerStyles).toMatch(/--quick-planner-chat-compose-gap:\s*30px/);
    expect(plannerStyles).toMatch(/top:\s*calc\(var\(--quick-planner-chat-picker-top\) \+ 34px \+ var\(--quick-planner-chat-compose-gap\)\)/);
    expect(plannerStyles).toMatch(/\.quick-planner-compose-input-row\s*\{[^}]*height:\s*calc\(100px \+ var\(--quick-planner-resize-height, 0px\)\)/);
  });

  it('fits the Planner content into a compact Electron window', () => {
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-header\s*\{[^}]*margin:\s*0 auto 8px;[^}]*padding:\s*0/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-layout\s*\{[^}]*grid-template-areas:\s*"editor";[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*height:\s*calc\(100% - 16px\)/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor\s*\{[^}]*height:\s*auto;[^}]*aspect-ratio:\s*1\.64\s*\/\s*1/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-editor\s*\{[^}]*width:\s*min\(100%,\s*800px\)/);
  });

  it('keeps compact Electron action modes in the top row without clipping', () => {
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor-heading\s*\{[^}]*top:\s*-22px/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-editor > \.quick-planner-heading-actions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*8px;[^}]*right:\s*16px/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor > \.quick-planner-chat-picker\s*\{[^}]*margin-top:\s*62px/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor > \.quick-planner-chat-picker-placeholder\s*\{[^}]*display:\s*block;[^}]*height:\s*34px;[^}]*margin:\s*62px 0 0/);
  });

  it('keeps Electron action modes aligned at compact desktop widths', () => {
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor-heading\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-22px;[^}]*left:\s*8px/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor > \.quick-planner-chat-picker\s*\{[^}]*position:\s*absolute;[^}]*top:\s*clamp\(62px,\s*calc\(50% - 90px\),\s*120px\);[^}]*right:\s*calc\(4% - 12px\)/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor > \.quick-planner-clock\s*\{[^}]*position:\s*absolute;[^}]*left:\s*16px/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-editor > \.quick-planner-heading-actions\s*\{[^}]*position:\s*absolute;[^}]*right:\s*16px/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*850px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch button\s*\{[^}]*font-size:\s*13px/);
  });

  it('slightly reduces the Current action selector in wide Electron windows', () => {
    expect(plannerStyles).toMatch(/@media \(min-width:\s*1301px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch button\s*\{[^}]*font-size:\s*20px/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*1301px\)[\s\S]*?html\.electron-runtime \.quick-planner-page\[lang\] \.quick-planner-mode-switch > \.quick-planner-mode-caption\s*\{[^}]*font-size:\s*11px/);
  });

  it('slightly reduces only the Create Reminder heading in wide Electron windows', () => {
    expect(plannerStyles).toMatch(/@media \(min-width:\s*1301px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor-heading > \.quick-planner-section-label\s*\{[^}]*font-size:\s*11px/);
  });

  it('opens browser draft mode with only local draft actions available', () => {
    const { container } = renderQuickPlanner({
      draftOnlyMode: true,
      chats: [],
      selectedChat: null,
    });
    const modeGroup = screen.getByRole('group', { name: 'Action mode' });

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', 'draft');
    expect(within(modeGroup).getAllByRole('button')).toHaveLength(1);
    expect(within(modeGroup).getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('lowers the Add tag control by three pixels', () => {
    expect(getCssRules('.quick-planner-type-toggle.is-add-tag')[0]).toMatch(/transform:\s*translateY\(3px\)/);
  });

  it('uses the saved color for each action and refreshes when Settings changes it', () => {
    writeEditorAppearancePreferences({
      style: 'outline',
      palette: 'custom',
      modeColors: { send: '#287fa6', schedule: '#b482f5', draft: '#f58b37' },
    });
    const { container } = renderQuickPlanner();
    const planner = container.querySelector<HTMLElement>('.quick-planner-page')!;

    expect(planner.style.getPropertyValue('--quick-planner-accent')).toBe('40, 127, 166');

    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    expect(planner.style.getPropertyValue('--quick-planner-accent')).toBe('180, 130, 245');

    act(() => {
      writeEditorAppearancePreferences({
        style: 'outline',
        palette: 'custom',
        modeColors: { send: '#287fa6', schedule: '#40e0d0', draft: '#f58b37' },
      });
    });
    expect(planner.style.getPropertyValue('--quick-planner-accent')).toBe('64, 224, 208');
  });

  it('keeps the schedule action in the lower toolbar at compact desktop widths', () => {
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-action-group\s*\{[^}]*position:\s*static;[^}]*transform:\s*none;/);
  });

  it('keeps the compose canvas open while preserving the outer editor glow', () => {
    const composeRules = getCssRules('.quick-planner-compose')[0];
    const focusedComposeRules = getCssRules('.quick-planner-compose:focus-within')[0];

    expect(composeRules).toMatch(/border:\s*0/);
    expect(composeRules).toMatch(/background:\s*transparent/);
    expect(composeRules).toMatch(/box-shadow:\s*none/);
    expect(composeRules).not.toMatch(/filter:/);
    expect(focusedComposeRules).toMatch(/background:\s*transparent/);
    expect(focusedComposeRules).toMatch(/box-shadow:\s*none/);
  });

  it('keeps the editor accent border without an outer glow', () => {
    const editorRules = getCssRules('.quick-planner-editor')[0];

    expect(editorRules).toMatch(/background:\s*linear-gradient\(180deg, rgba\(7, 14, 21, 0\.94\), rgba\(8, 15, 20, 0\.9\)\)/);
    expect(editorRules).toMatch(/border:\s*1px solid rgba\(var\(--quick-planner-accent\), 0\.28\)/);
    expect(editorRules).toMatch(/box-shadow:\s*0 10px 28px rgba\(6, 12, 17, 0\.18\)/);
    expect(editorRules).not.toMatch(/0 0 (?:10|28)px rgba\(var\(--quick-planner-accent\)/);
    expect(plannerStyles).toMatch(/--quick-planner-accent:\s*35, 157, 251/);
    expect(plannerStyles).not.toMatch(/data-publish-mode="(?:schedule|draft)"\)\s*\{/);
  });

  it('reveals Draft actions on hover and focus, while keeping touch and pinned actions available', () => {
    const actionRules = getCssRules('.quick-planner-draft-actions button')[0];

    expect(getCssRules('.quick-planner-draft:hover')).toHaveLength(0);
    expect(actionRules).toMatch(/opacity:\s*0/);
    expect(actionRules).toMatch(/pointer-events:\s*none/);
    expect(plannerStyles).toMatch(/\.quick-planner-draft:hover \.quick-planner-draft-actions button,[\s\S]*?\.quick-planner-draft:focus-within \.quick-planner-draft-actions button\s*\{[^}]*opacity:\s*1/);
    const pinnedRules = getCssRules('.quick-planner-draft-pin.is-pinned');
    expect(pinnedRules[pinnedRules.length - 1]).toMatch(/opacity:\s*1/);
    expect(plannerStyles).toMatch(/@media\s*\(hover:\s*none\)[\s\S]*?\.quick-planner-draft-actions button\s*\{[^}]*opacity:\s*1/);
  });

  it('raises only the Current action caption by ten pixels', () => {
    const currentActionRules = getCssRules('.quick-planner-mode-switch > .quick-planner-mode-caption');

    expect(currentActionRules[0]).toMatch(/transform:\s*translateY\(-13px\)/);
    expect(currentActionRules.some((rules) => /font-size:\s*8px/.test(rules) && /letter-spacing:\s*0\.08em/.test(rules))).toBe(true);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*561px\)\s*and\s*\(max-width:\s*720px\)\s*\{\s*\.quick-planner-mode-switch\s*>\s*\.quick-planner-mode-caption\s*\{[^}]*font-size:\s*8px;[^}]*transform:\s*none;/);
  });

  it('keeps the action caption and all mode buttons on one row in the two-column desktop layout', () => {
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-editor\s*>\s*\.quick-planner-heading-actions\s*\{[^}]*top:\s*70px;[^}]*left:\s*14px;[^}]*transform:\s*none/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-mode-switch\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content\s+max-content\s+max-content\s+max-content;[^}]*grid-template-rows:\s*32px/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-mode-switch\s*>\s*\.quick-planner-mode-caption\s*\{[^}]*grid-row:\s*1;[^}]*grid-column:\s*1;/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-page\[lang\] \.quick-planner-mode-switch button\s*\{[^}]*grid-row:\s*1;[^}]*height:\s*30px;[^}]*white-space:\s*nowrap/);
  });

  it('keeps a single centered editor column at compact desktop widths', () => {
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-layout\s*\{[^}]*grid-template-areas:\s*"editor";[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-page \.quick-planner-editor\s*\{[^}]*height:\s*auto;[^}]*transform:\s*none/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-page \.quick-planner-compose-anchor\s*\{[^}]*position:\s*relative/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1200px\)[\s\S]*?\.quick-planner-page\[data-publish-mode\] \.quick-planner-compose-footer\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/);
    expect(plannerStyles).toMatch(/@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.quick-planner-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('moves the sidebar motivation to the right without exceeding the panel width', () => {
    const noteRules = getCssRules('.quick-planner-sidebar-note')[0];

    expect(noteRules).toMatch(/align-self:\s*flex-end/);
    expect(noteRules).toMatch(/max-width:\s*100%/);
    expect(noteRules).toMatch(/text-align:\s*right/);
  });

  it('raises the lower sidebar by four pixels', () => {
    const sidebarRules = getCssRules('.quick-planner-sidebar')[0];

    expect(sidebarRules).toMatch(/transform:\s*translate\(-28px,\s*-1px\)/);
    expect(sidebarRules).toMatch(/radial-gradient\(90% 70% at 100% 100%/);
  });

  it('keeps the emoji picker inside the composer and uses an emoji font', () => {
    const pickerRules = getCssRules('.quick-planner-emoji-picker')[0];
    const emojiButtonRules = getCssRules('.quick-planner-emoji-picker button')[0];

    // The picker is anchored to the composer (not the toolbar), stays inside the
    // compose frame, and opens upward above the toolbar with a scrollable body.
    expect(pickerRules).toMatch(/position:\s*absolute/);
    expect(pickerRules).toMatch(/top:\s*auto/);
    expect(pickerRules).toMatch(/bottom:\s*52px/);
    expect(pickerRules).toMatch(/align-content:\s*start/);
    expect(pickerRules).toMatch(/overflow-y:\s*auto/);
    expect(emojiButtonRules).toMatch(/font-family:\s*"Segoe UI Emoji"/);
    expect(emojiButtonRules).toMatch(/appearance:\s*none/);
  });

  it('keeps the input frame fixed while text, type, and mode change', () => {
    const { container } = renderQuickPlanner();
    const frame = container.querySelector('.quick-planner-compose');
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));
    const composeAnchorRules = getCssRules('.quick-planner-compose-anchor')
      .find((rules) => /position:\s*absolute/.test(rules));
    const initialClassName = frame?.className;
    const initialInlineStyle = frame?.getAttribute('style');
    const frameRules = getCssRules('.quick-planner-compose')[0];

    expect(frameRules).toMatch(/position:\s*relative/);
    expect(frameRules).toMatch(/display:\s*flex/);
    expect(frameRules).toMatch(/width:\s*100%/);
    expect(frameRules).toMatch(/height:\s*calc\(240px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(frameRules).toMatch(/min-height:\s*0/);
    expect(composeAnchorRules).toMatch(/top:\s*110px/);
    expect(composeAnchorRules).not.toMatch(/resize-offset/);
    expect(composeAnchorRules).not.toMatch(/resize-half-height/);

    fireEvent.change(textField, { target: { value: 'x'.repeat(500) } });
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);

    fireEvent.click(modeGroup.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(modeGroup.getByRole('button', { name: 'Draft' }));
    fireEvent.click(modeGroup.getByRole('button', { name: 'Send now' }));
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);

    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);
  });

  it('limits downward composer resizing to a 50px increase', () => {
    localStorage.removeItem('xmsgi-quick-planner-compose-height-v2');
    const { container } = renderQuickPlanner();
    const editor = container.querySelector('.quick-planner-editor');
    const composeAnchor = container.querySelector('.quick-planner-compose-anchor');
    const resizeHandle = screen.getByRole('button', { name: 'Resize reminder field height' });

    fireEvent.pointerDown(resizeHandle, { button: 0, pointerId: 7, clientY: 120 });
    fireEvent.pointerMove(resizeHandle, { pointerId: 7, clientY: 170 });

    expect(composeAnchor).toHaveStyle({
      '--quick-planner-resize-height': '50px',
    });
    fireEvent.pointerMove(resizeHandle, { pointerId: 7, clientY: 500 });
    expect(composeAnchor).toHaveStyle({
      '--quick-planner-resize-height': '50px',
    });
    expect(composeAnchor?.getAttribute('style')).not.toContain('--quick-planner-resize-offset');
    expect(editor).not.toHaveAttribute('style');
  });

  it('persists the chosen reminder tag across page remounts', () => {
    const { unmount } = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder type' }));

    const tags = within(screen.getByRole('group', { name: 'Reminder type' }));
    expect(tags.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['None', 'Task', 'Meeting', 'Reminder', 'Event', 'Idea']);
    fireEvent.click(tags.getByRole('button', { name: 'Idea' }));

    expect(screen.getByRole('button', { name: 'Change type: Idea' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Reminder type' })).not.toBeInTheDocument();
    unmount();

    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
    expect(screen.getByRole('button', { name: 'Change type: Idea' })).toBeInTheDocument();
  });

  it('highlights reminder categories with the selected theme and omits the trailing close icon', () => {
    renderQuickPlanner();
    selectDraftMode();
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder type' }));

    const categories = screen.getByRole('group', { name: 'Reminder type' });
    const categoryRules = getCssRules('.quick-planner-reminder-types button')[0];
    const selectedCategoryRules = getCssRules('.quick-planner-reminder-types button.is-selected')[0];

    expect(within(categories).getByRole('button', { name: 'None' })).toHaveClass('is-selected');
    expect(categories.parentElement?.querySelector('.quick-planner-type-toggle')).toBeNull();
    expect(categoryRules).toMatch(/color:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(categoryRules).toMatch(/background:\s*rgba\(var\(--quick-planner-accent\),\s*0\.08\)/);
    expect(selectedCategoryRules).toMatch(/background:\s*rgba\(var\(--quick-planner-accent\),\s*0\.22\)/);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Reminder type' })).not.toBeInTheDocument();
  });

  it('shows a different sidebar motivation after re-entering Quick Planner', () => {
    const phraseOptions = [
      'Keep growing, keep glowing.',
      'Be patient with your progress.',
      'Make your ordinary extraordinary.',
      'Focus on what matters.',
      'Choose what moves you forward.',
    ];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const firstRender = renderQuickPlanner();
      const firstPhrase = firstRender.container.querySelector('.quick-planner-sidebar-note')?.textContent;
      firstRender.unmount();

      const secondRender = renderQuickPlanner();
      const secondPhrase = secondRender.container.querySelector('.quick-planner-sidebar-note')?.textContent;

      expect(phraseOptions).toContain(firstPhrase);
      expect(phraseOptions).toContain(secondPhrase);
      expect(secondPhrase).not.toBe(firstPhrase);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('keeps the planner window and text editor centered at a stable desktop width', () => {
    const layoutRules = getCssRules('.quick-planner-layout')[0];
    const editorRules = getCssRules('.quick-planner-editor')[0];
    const sidebarRules = getCssRules('.quick-planner-sidebar')[0];
    const upcomingColumnRules = getCssRules('.quick-planner-upcoming-column')
      .find((rules) => /translate\(-28px,\s*3px\)/.test(rules));
    const compactUpcomingColumnRules = getCssRules('.quick-planner-upcoming-column')
      .find((rules) => /height:\s*390px/.test(rules));
    const upcomingBottomLineRules = getCssRules('.quick-planner-upcoming-column::after')[0];
    const upcomingRules = getCssRules('.quick-planner-upcoming');
    const desktopUpcomingRules = upcomingRules.find((rules) => /padding:\s*14px\s+14px\s+0/.test(rules));
    const reminderListRules = getCssRules('.quick-planner-reminder-list')[0];
    const reminderScrollAreaRules = getCssRules('.quick-planner-reminder-scroll-area')[0];
    const composeRules = getCssRules('.quick-planner-compose')[0];

    expect(layoutRules).toMatch(/width:\s*min\(100%,\s*1460px\)/);
    expect(plannerStyles).toContain('@media (min-width: 701px) and (max-width: 1200px)');
    expect(layoutRules).toMatch(/margin:\s*0\s+auto/);
    expect(upcomingColumnRules).toMatch(/inset 0 -1px 0 rgba\(var\(--quick-planner-accent\), 0\.16\)/);
    expect(upcomingColumnRules).toMatch(/inset 0 -4px 5px rgba\(0, 0, 0, 0\.16\)/);
    expect(upcomingBottomLineRules).toMatch(/position:\s*absolute/);
    expect(upcomingBottomLineRules).toMatch(/bottom:\s*1px/);
    expect(upcomingBottomLineRules).toMatch(/z-index:\s*5/);
    expect(upcomingBottomLineRules).toMatch(/height:\s*1px/);
    expect(layoutRules).toMatch(/grid-template-areas:\s*"editor"/);
    expect(layoutRules).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(layoutRules).toMatch(/gap:\s*20px/);
    expect(editorRules).toMatch(/transform:\s*translateY\(0\)/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/min-height:\s*190px/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/padding:\s*12px\s+14px/);
    expect(sidebarRules).toMatch(/transform:\s*translate\(-28px,\s*-1px\)/);
    expect(upcomingColumnRules).toMatch(/transform:\s*translate\(-28px,\s*3px\)/);
    expect(upcomingColumnRules).toMatch(/height:\s*400px/);
    expect(compactUpcomingColumnRules).toBeDefined();
    expect(upcomingColumnRules).toMatch(/border:\s*1px\s+solid\s+rgba\(var\(--quick-planner-accent\),\s*0\.28\)/);
    expect(upcomingColumnRules).toMatch(/gap:\s*0/);
    expect(desktopUpcomingRules).toBeDefined();
    expect(desktopUpcomingRules).toMatch(/border:\s*0/);
    expect(desktopUpcomingRules).toMatch(/box-shadow:\s*none/);
    expect(getCssRules('.quick-planner-open-studio-full')[0]).toMatch(/border:\s*1px\s+solid\s+transparent/);
    expect(getCssRules('.quick-planner-open-studio-full')[0]).toMatch(/border-radius:\s*12px/);
    expect(plannerStyles).toMatch(/\.quick-planner-open-studio-full:hover,\s*\.quick-planner-open-studio-full:focus-visible\s*\{[\s\S]*?background:\s*rgba\(var\(--quick-planner-accent\),\s*0\.105\)/);
    expect(plannerStyles).toMatch(/\.quick-planner-open-studio-full:hover::before,\s*\.quick-planner-open-studio-full:focus-visible::before\s*\{[\s\S]*?background:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(getCssRules('.quick-planner-draft-selection-hint')[0]).toMatch(/color:\s*#ffd166/);
    expect(upcomingRules.some((rules) => /height:\s*auto/.test(rules))).toBe(true);
    expect(desktopUpcomingRules).toMatch(/overflow:\s*visible/);
    expect(reminderScrollAreaRules).toMatch(/margin:\s*0/);
    expect(reminderScrollAreaRules).toMatch(/padding:\s*0\s+5px\s+0\s+9px/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/margin:\s*0/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/padding:\s*8px\s+2px/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/border-bottom:\s*1px\s+solid/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/border-radius:\s*0/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/box-shadow:\s*none/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/gap:\s*3px/);
    expect(getCssRules('.quick-planner-draft > span')[0]).toMatch(/font-size:\s*15px/);
    expect(getCssRules('.quick-planner-draft > span')[0]).toMatch(/-webkit-line-clamp:\s*2/);
    expect(getCssRules('.quick-planner-draft-scrollbar')[0]).toMatch(/right:\s*-12px/);
    expect(reminderListRules).toMatch(/scrollbar-width:\s*none/);
    expect(editorRules).toMatch(/grid-area:\s*editor/);
    expect(editorRules).toMatch(/transform:\s*translateY\(0\)/);
    expect(editorRules).not.toMatch(/translateX/);
    expect(editorRules).toMatch(/width:\s*min\(100%,\s*760px\)/);
    expect(editorRules).toMatch(/height:\s*min\(100%,\s*500px\)/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-clock')[0]).toMatch(/top:\s*17px/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-clock')[0]).toMatch(/left:\s*14px/);
    expect(composeRules).toMatch(/position:\s*relative/);
    expect(composeRules).toMatch(/width:\s*100%/);
    expect(composeRules).toMatch(/height:\s*calc\(240px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(getCssRules('.quick-planner-send')[0]).toMatch(/min-width:\s*118px/);
    expect(getCssRules('.quick-planner-send')[0]).toMatch(/margin-inline:\s*4px/);
    expect(getCssRules('.quick-planner-send')[0]).toMatch(/transform:\s*translateY\(3px\)/);
    expect(getCssRules('.quick-planner-send')[0]).not.toMatch(/scaleX|clip-path/);
    expect(getCssRules('.quick-planner-send')[0]).toMatch(/transform-origin:\s*center/);
  });

  it('resets the desktop offsets and stretches the editor on narrow screens', () => {
    const layoutRules = getCssRules('.quick-planner-layout');
    const editorRules = getCssRules('.quick-planner-editor');
    const composeRules = getCssRules('.quick-planner-compose');
    const mobileLayoutRules = layoutRules.find((rules) => /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(rules));
    const mobileEditorRules = editorRules.find((rules) => /justify-self:\s*stretch/.test(rules) && /height:\s*auto/.test(rules) && /transform:\s*none/.test(rules));
    const mobileComposeRules = composeRules.find((rules) => /position:\s*static/.test(rules));

    expect(mobileEditorRules).toMatch(/justify-self:\s*stretch/);
    expect(mobileEditorRules).toMatch(/width:\s*100%/);
    expect(mobileEditorRules).toMatch(/min-width:\s*0/);
    expect(mobileEditorRules).toMatch(/transform:\s*none/);
    expect(mobileLayoutRules).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(mobileEditorRules).toMatch(/height:\s*auto/);
    expect(mobileEditorRules).toMatch(/overflow:\s*visible/);
    expect(mobileComposeRules).toMatch(/width:\s*100%/);
    expect(mobileComposeRules).toMatch(/min-width:\s*0/);
    expect(mobileComposeRules).toMatch(/height:\s*auto/);
    expect(mobileComposeRules).toMatch(/position:\s*static/);
    expect(mobileComposeRules).toMatch(/flex:\s*1 1 auto/);
    expect(mobileComposeRules).toMatch(/min-height:\s*calc\(240px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(mobileComposeRules).not.toMatch(/transform:\s*translateY/);
  });

  it('reserves the recipient row in draft mode to keep the mobile compose field in place', () => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    fireEvent.click(modeGroup.getByRole('button', { name: 'Draft' }));

    const placeholder = container.querySelector('.quick-planner-chat-picker-placeholder');
    const mobilePickerRules = getCssRules('.quick-planner-editor > .quick-planner-chat-picker')
      .find((rules) => /height:\s*34px/.test(rules));
    const mobilePlaceholderRules = getCssRules('.quick-planner-editor > .quick-planner-chat-picker-placeholder')
      .find((rules) => /height:\s*34px/.test(rules));

    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder?.nextElementSibling).toHaveClass('quick-planner-compose-anchor');
    expect(mobilePickerRules).toMatch(/height:\s*34px/);
    expect(mobilePlaceholderRules).toMatch(/flex:\s*0\s+0\s+34px/);
  });

  it('keeps schedule shortcuts in one row on compact Electron desktop', () => {
    const editorRules = getCssRules('html.electron-runtime .quick-planner-page .quick-planner-editor')
      .find((rules) => /width:\s*min\(100%,\s*calc\(82vw \/ var\(--electron-ui-scale,\s*1\)\)\)/.test(rules));
    const composeAnchorRules = getCssRules('html.electron-runtime .quick-planner-page .quick-planner-compose-anchor')
      .find((rules) => /position:\s*absolute/.test(rules));
    const toolsRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-tools')
      .find((rules) => /flex-wrap:\s*nowrap/.test(rules) && /overflow-x:\s*auto/.test(rules));
    const quickValuesRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /flex:\s*0\s+0\s+auto/.test(rules) && /flex-wrap:\s*nowrap/.test(rules));

    expect(plannerStyles).toContain('@media (min-width: 701px) and (max-width: 1200px)');
    expect(editorRules).toMatch(/justify-self:\s*center/);
    expect(editorRules).toMatch(/max-width:\s*none/);
    expect(editorRules).toMatch(/height:\s*auto/);
    expect(editorRules).toMatch(/aspect-ratio:\s*1\.64\s*\/\s*1/);
    expect(editorRules).toMatch(/align-self:\s*center/);
    expect(composeAnchorRules).toMatch(/top:\s*auto/);
    expect(composeAnchorRules).toMatch(/bottom:\s*16px/);
    expect(composeAnchorRules).toMatch(/transform:\s*none/);
    expect(toolsRules).toBeTruthy();
    expect(quickValuesRules).toMatch(/width:\s*max-content/);
    expect(quickValuesRules).toMatch(/min-width:\s*max-content/);
    expect(quickValuesRules).toMatch(/overflow:\s*visible/);
  });

  it('aligns compact Electron mode indicators and prevents schedule fields from clipping', () => {
    expect(plannerStyles).toMatch(/@media \(min-width: 701px\) and \(max-width: 1300px\) and \(max-height: 820px\)[\s\S]*?\.quick-planner-mode-switch button\.is-selected::after\s*\{[^}]*top:\s*calc\(-1 \* clamp\(14px, calc\(1\.5vw \/ var\(--electron-ui-scale, 1\)\), 24px\)\);[^}]*bottom:\s*auto;[^}]*height:\s*2px;/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-controls label,[\s\S]*?\.quick-planner-schedule-clock\s*\{\s*transform:\s*none;/);
  });

  it('anchors the Electron composer below the chat picker at every desktop width', () => {
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\s*\{[^}]*--quick-planner-chat-picker-top:\s*clamp\(44px, calc\(18vh \/ var\(--electron-ui-scale, 1\)\), 120px\);[^}]*--quick-planner-chat-compose-gap:\s*30px;/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page \.quick-planner-compose-anchor\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(var\(--quick-planner-chat-picker-top\) \+ 34px \+ var\(--quick-planner-chat-compose-gap\)\);[^}]*right:\s*clamp\(12px, calc\(4% - 12px\), 24px\);[^}]*left:\s*clamp\(12px, calc\(4% - 12px\), 24px\);/);
  });

  it('reserves a bottom grid row for Planner status messages on compact Electron windows', () => {
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1300px\)[\s\S]*?html\.electron-runtime \.quick-planner-editor\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto minmax\(42px, auto\)/);
    expect(plannerStyles).toMatch(/@media \(min-width:\s*701px\) and \(max-width:\s*1300px\)[\s\S]*?html\.electron-runtime \.quick-planner-page \.quick-planner-editor > \.messages-panel-wrapper\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*4;[^}]*min-height:\s*42px/);
  });

  it('wraps schedule controls in the mobile composer', () => {
    const footerRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-compose-footer')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));
    const toolsRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-tools')
      .find((rules) => /width:\s*100%/.test(rules));
    const composeRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-compose')
      .find((rules) => /height:\s*auto/.test(rules));

    expect(plannerStyles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-compose-footer\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(footerRules).toMatch(/flex-wrap:\s*wrap/);
    expect(toolsRules).toMatch(/width:\s*100%/);
    expect(composeRules).toMatch(/min-height:\s*calc\(240px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
  });

  it('opens the time picker from the whole time pill and selects the current value for replacement', () => {
    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateDigits = `${String(tomorrow.getDate()).padStart(2, '0')}${String(tomorrow.getMonth() + 1).padStart(2, '0')}${tomorrow.getFullYear()}`;
    fireEvent.change(screen.getByRole('textbox', { name: 'Schedule date' }), { target: { value: tomorrowDateDigits } });

    const timeInput = screen.getByRole('textbox', { name: 'Schedule time' });
    expect(timeInput).toBeInTheDocument();
    fireEvent.click(timeInput);
    expect(screen.getByRole('dialog', { name: 'Schedule time picker' })).toBeInTheDocument();

    const editableTime = screen.getByRole('textbox', { name: 'Enter schedule time' }) as HTMLInputElement;
    expect(editableTime).toHaveFocus();
    expect(editableTime.selectionStart).toBe(0);
    expect(editableTime.selectionEnd).toBe(editableTime.value.length);

    fireEvent.change(editableTime, { target: { value: '1656' } });
    expect(timeInput).toHaveTextContent('16:56');
  });

  it('keeps compact-desktop quick schedule choices alongside date and time in one row', () => {
    const actionRules = getCssRules('.quick-planner-editor > .quick-planner-heading-actions')
      .find((rules) => /right:\s*8px/.test(rules));
    const quickValuesRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /transform:\s*none/.test(rules) && /flex:\s*0\s+0\s+auto/.test(rules) && /flex-wrap:\s*nowrap/.test(rules));
    const footerRules = getCssRules('.quick-planner-page[data-publish-mode] .quick-planner-compose-footer')
      .find((rules) => /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/.test(rules));

    expect(actionRules).toMatch(/right:\s*8px/);
    expect(quickValuesRules).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(quickValuesRules).toMatch(/flex-wrap:\s*nowrap/);
    expect(footerRules).toBeTruthy();
  });

  it('hides the side panels early while keeping schedule controls visible at medium widths', () => {
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-layout\s*\{[^}]*grid-template-areas:\s*"editor";[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(plannerStyles).toMatch(/@container quick-planner \(max-width:\s*1200px\)[\s\S]*?html\.electron-runtime \.quick-planner-upcoming-column,[\s\S]*?\.quick-planner-sidebar\s*\{[^}]*display:\s*none/);
    expect(plannerStyles).not.toMatch(/@container quick-planner \(min-width:\s*701px\) and \(max-width:\s*1200px\)[\s\S]*?\.quick-planner-schedule-quick-values\s*\{[^}]*display:\s*none/);
    expect(plannerStyles).toMatch(/\.quick-planner-schedule-date input\s*\{[^}]*width:\s*96px/);
  });

  it('keeps the empty action-group area from intercepting quick schedule clicks', () => {
    expect(getCssRules('.quick-planner-action-group')[0]).toMatch(/pointer-events:\s*none/);
    expect(getCssRules('.quick-planner-action-group > *')[0]).toMatch(/pointer-events:\s*auto/);
  });

  it('moves the action selector below the clock on the narrowest desktop widths', () => {
    const actionRules = getCssRules('.quick-planner-editor > .quick-planner-heading-actions')
      .find((rules) => /top:\s*70px/.test(rules));

    expect(actionRules).toMatch(/left:\s*22px/);
    expect(actionRules).toMatch(/right:\s*22px/);
    expect(actionRules).toMatch(/transform:\s*none/);
  });

  it('wraps draft actions inside the composer on small screens', () => {
    const footerRules = getCssRules('.quick-planner-page[data-publish-mode="draft"] .quick-planner-compose-footer')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));
    const toolsRules = getCssRules('.quick-planner-page[data-publish-mode="draft"] .quick-planner-tools')
      .find((rules) => /width:\s*100%/.test(rules));

    expect(footerRules).toMatch(/flex-wrap:\s*wrap/);
    expect(toolsRules).toMatch(/flex:\s*1\s+1\s+100%/);
  });

  it('stacks schedule date and time controls on the smallest screens', () => {
    const controlsRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-controls')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));
    const labelRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-controls label')
      .find((rules) => /flex:\s*1\s+1\s+100%/.test(rules));
    const dateRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-date input')
      .find((rules) => /width:\s*108px/.test(rules));
    const quickValuesRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /overflow:\s*visible/.test(rules));

    expect(controlsRules).toMatch(/overflow:\s*visible/);
    expect(labelRules).toMatch(/flex:\s*1\s+1\s+100%/);
    expect(dateRules).toMatch(/width:\s*108px/);
    expect(quickValuesRules).toMatch(/flex-wrap:\s*wrap/);
  });

  it('keeps the schedule date and time containers at their original size and lowers them', () => {
    const labelRules = getCssRules('.quick-planner-schedule-controls label')[0];
    const clockRules = getCssRules('.quick-planner-schedule-clock')[0];

    expect(labelRules).toMatch(/height:\s*32px/);
    expect(labelRules).toMatch(/transform:\s*translateY\(3px\)/);
    expect(labelRules).toMatch(/border:\s*1px solid rgba\(var\(--quick-planner-accent\),\s*0\.5\)/);
    expect(labelRules).toMatch(/border-radius:\s*8px/);
    expect(clockRules).toMatch(/border:\s*1px solid rgba\(var\(--quick-planner-accent\),\s*0\.5\)/);
    expect(clockRules).toMatch(/border-radius:\s*8px/);
  });

  it('trims only the Electron date pill and tightens schedule control spacing', () => {
    const dateRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-date')
      .find((rules) => /padding-right:\s*8px/.test(rules));
    const controlRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-controls')
      .find((rules) => /gap:\s*4px/.test(rules));
    const quickValueRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /gap:\s*3px/.test(rules));
    const quickGroupRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-group')
      .find((rules) => /gap:\s*4px/.test(rules));
    const groupSpacingRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-group + .quick-planner-schedule-quick-group')
      .find((rules) => /margin-left:\s*4px/.test(rules));
    const timeGroupRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-group.is-time')
      .find((rules) => /padding-left:\s*8px/.test(rules));

    expect(dateRules).toBeTruthy();
    expect(controlRules).toBeTruthy();
    expect(quickValueRules).toBeTruthy();
    expect(quickGroupRules).toBeTruthy();
    expect(groupSpacingRules).toBeTruthy();
    expect(timeGroupRules).toBeTruthy();
  });

  it('keeps Electron quick-schedule presets compact without scaling them', () => {
    const buttonRules = getCssRules('html.electron-runtime .quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values button')
      .find((rules) => /height:\s*28px/.test(rules) && /font-size:\s*9\.5px/.test(rules));

    expect(buttonRules).toMatch(/padding:\s*0 5\.5px/);
    expect(buttonRules).toMatch(/font-size:\s*9\.5px/);
    expect(buttonRules).not.toMatch(/transform:/);
  });

  it('slightly enlarges Electron date and time pills without moving them', () => {
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-controls label,\s*html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-clock\s*\{[^}]*height:\s*34px/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-date input,\s*html\.electron-runtime \.quick-planner-page\[data-publish-mode="schedule"\] \.quick-planner-schedule-clock > span\s*\{[^}]*font-size:\s*14\.5px/);
  });

  it('keeps emoji and attachment tools enlarged and aligned in every Planner mode', () => {
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page \.quick-planner-tools > button\[aria-label="Add emoji"\],\s*html\.electron-runtime \.quick-planner-page \.quick-planner-tools > button\[aria-label="Add attachment"\]\s*\{[^}]*height:\s*34px;[^}]*transform:\s*translateY\(3px\)/);
    expect(plannerStyles).toMatch(/html\.electron-runtime \.quick-planner-page \.quick-planner-tools > button\[aria-label="Add emoji"\] svg,\s*html\.electron-runtime \.quick-planner-page \.quick-planner-tools > button\[aria-label="Add attachment"\] svg\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px/);
  });

  it('dims the selected Telegram chat surface slightly', () => {
    expect(getCssRules('.quick-planner-chat-picker .chat-picker-current')[0])
      .toMatch(/background:\s*rgba\(var\(--quick-planner-accent\),\s*0\.05\)/);
  });

  it('moves only Draft paperclip icons one pixel left', () => {
    expect(plannerStyles).toMatch(/\.quick-planner-page\[data-publish-mode="draft"\] \.quick-planner-tools > button\[aria-label="Add attachment"\] svg,\s*\.quick-planner-page\[data-publish-mode="draft"\] \.quick-planner-draft small:not\(\.quick-planner-draft-tag\) > svg\s*\{[^}]*position:\s*relative;[^}]*left:\s*-1px/);
    expect(plannerStyles).toMatch(/\.quick-planner-page\[data-publish-mode="draft"\] \.quick-planner-draft small:not\(\.quick-planner-draft-tag\) > svg\s*\{[^}]*left:\s*-0\.5px/);
  });

  it('moves the Send now paperclip 1px left without shifting its button', () => {
    expect(plannerStyles).toMatch(/\.quick-planner-page\[data-publish-mode="send"\] \.quick-planner-tools > button\[aria-label="Add attachment"\] svg\s*\{[^}]*position:\s*relative;[^}]*left:\s*-1px/);
  });

  it('opens the editable time picker when the time pill is clicked', () => {
    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open time picker' }));

    expect(screen.getByRole('textbox', { name: 'Enter schedule time' })).toBeInTheDocument();
  });
});

describe('QuickPlannerPage action mode', () => {
  it('shows Send now, Schedule, and Draft in the top action mode selector', () => {
    const { container } = renderQuickPlanner();
    const modes = within(screen.getByRole('group', { name: 'Action mode' }))
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(modes).toEqual(['Send now', 'Schedule', 'Draft']);
    expect(container.querySelector('.quick-planner-send-label')).toHaveTextContent('Send now');
    const quickNavigation = within(screen.getByRole('navigation', { name: 'Workspace navigation' }));
    const navigationButtons = quickNavigation.getAllByRole('button');
    expect(navigationButtons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Studio', 'Posts', 'Settings']);
    expect(navigationButtons.filter((button) => button.classList.contains('is-active'))).toHaveLength(0);
    expect(navigationButtons[0]).not.toHaveAttribute('aria-current');
    expect(quickNavigation.queryByRole('button', { name: 'Quick Plan' })).not.toBeInTheDocument();
  });

  it('uses localized labels for the planner navigation in Russian', () => {
    localStorage.setItem('awaitmsg_locale', 'ru');
    renderQuickPlanner();

    expect(screen.getByRole('button', { name: 'Студия' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Публикации' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();

    localStorage.removeItem('awaitmsg_locale');
  });

  it('labels the lower-right planner panel Draft with a lightning icon', () => {
    const { container } = renderQuickPlanner();
    selectDraftMode();

    expect(container.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('Draft');
    expect(container.querySelector('.quick-planner-upcoming-heading .lucide-zap')).toBeInTheDocument();
    expect(screen.getByText('Thoughts & Studio')).toBeInTheDocument();
    expect(container.querySelector('.quick-planner-upcoming-dot')).not.toBeInTheDocument();
  });

  it('shows compact History preview rows with persistent actions', () => {
    const { container } = renderQuickPlanner();
    const panel = container.querySelector('.quick-planner-upcoming-column');

    expect(panel?.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('History');
    expect(panel?.querySelector('.quick-planner-upcoming-heading .lucide-zap')).toBeInTheDocument();
    expect(panel?.querySelector('.quick-planner-panel-title')).toBeInTheDocument();
    expect(getCssRules('.quick-planner-upcoming-heading > span:first-child')[0]).toMatch(/color:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(getCssRules('.quick-planner-mode-switch button.is-selected')[0]).toMatch(/color:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(getCssRules('.quick-planner-upcoming-heading > span:last-child')).toHaveLength(0);
    expect(within(panel as HTMLElement).getByText('Release notes are ready for review.')).toBeInTheDocument();
    expect(panel?.querySelectorAll('[role="listitem"]')).toHaveLength(9);
    expect(panel?.querySelectorAll('.quick-planner-mode-preview-action')).toHaveLength(18);
    expect(panel?.querySelector('.quick-planner-mode-preview-group[aria-label="Earlier"]')).toBeInTheDocument();
    expect(getCssRules('.quick-planner-mode-preview-group-label')[0]).toMatch(/font-size:\s*11px/);
    expect(getCssRules('.quick-planner-mode-preview-list')[0]).toMatch(/overflow-y:\s*auto/);
    expect(getCssRules('.quick-planner-mode-preview-list')[0]).toMatch(/scrollbar-width:\s*none/);
    expect(getCssRules('.quick-planner-mode-preview-list')[0]).toMatch(/overscroll-behavior:\s*contain/);
    expect(getCssRules('.quick-planner-mode-preview-time')[0]).toMatch(/font-size:\s*12px/);
    expect(getCssRules('.quick-planner-mode-preview-chat').find((rules) => /font-size:\s*12px/.test(rules))).toBeDefined();
    expect(getCssRules('.quick-planner-mode-preview-message').find((rules) => /font-size:\s*12px/.test(rules))).toBeDefined();
    expect(getCssRules('.quick-planner-mode-preview-actions')[0]).toMatch(/pointer-events:\s*auto/);
    expect(getCssRules('.quick-planner-mode-preview-action')[0]).toMatch(/opacity:\s*1/);
    expect(getCssRules('.quick-planner-mode-preview-action')[0]).toMatch(/pointer-events:\s*auto/);
    expect(getCssRules('.quick-planner-mode-preview-row.is-pinned .quick-planner-mode-preview-action.is-pinned')[0]).toMatch(/opacity:\s*1/);
    expect(getCssRules('.quick-planner-mode-preview-row:hover')).toHaveLength(0);
  });

  it('shows compact Queue preview rows with persistent actions', () => {
    const { container } = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    const panel = container.querySelector('.quick-planner-upcoming-column');

    expect(panel?.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('Queue');
    expect(panel?.querySelector('.quick-planner-upcoming-heading .lucide-zap')).toBeInTheDocument();
    expect(panel?.querySelector('.quick-planner-panel-title')).toBeInTheDocument();
    expect(getCssRules('.quick-planner-upcoming-heading > span:first-child')[0]).toMatch(/color:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(getCssRules('.quick-planner-mode-switch button.is-selected')[0]).toMatch(/color:\s*rgb\(var\(--quick-planner-accent\)\)/);
    expect(within(panel as HTMLElement).getByText('Share the release notes.')).toBeInTheDocument();
    expect(panel?.querySelectorAll('[role="listitem"]')).toHaveLength(9);
    expect(panel?.querySelectorAll('.quick-planner-mode-preview-action')).toHaveLength(18);
    expect(panel?.querySelector('.quick-planner-mode-preview-group[aria-label="Later"]')).toBeInTheDocument();
    expect(getCssRules('.quick-planner-mode-preview-actions')[0]).toMatch(/pointer-events:\s*auto/);
    expect(getCssRules('.quick-planner-mode-preview-action')[0]).toMatch(/opacity:\s*1/);
    expect(getCssRules('.quick-planner-mode-preview-action')[0]).toMatch(/pointer-events:\s*auto/);
    expect(getCssRules('.quick-planner-mode-preview-row.is-pinned .quick-planner-mode-preview-action.is-pinned')[0]).toMatch(/opacity:\s*1/);
    expect(getCssRules('.quick-planner-mode-preview-row:hover')).toHaveLength(0);
  });

  it('translates the Queue panel heading in Russian', () => {
    const previousLocale = window.localStorage.getItem('awaitmsg_locale');
    window.localStorage.setItem('awaitmsg_locale', 'ru');
    const { container } = renderQuickPlanner();
    if (previousLocale === null) window.localStorage.removeItem('awaitmsg_locale');
    else window.localStorage.setItem('awaitmsg_locale', previousLocale);
    fireEvent.click(within(screen.getByRole('group', { name: 'Режим действия' })).getByRole('button', { name: 'Запланировать' }));

    expect(container.querySelector('.quick-planner-panel-title')?.textContent).toContain('Очередь');
  });

  it('translates the receiver and reminder type controls in Russian', () => {
    const previousLocale = window.localStorage.getItem('awaitmsg_locale');
    window.localStorage.setItem('awaitmsg_locale', 'ru');
    renderQuickPlanner();
    if (previousLocale === null) window.localStorage.removeItem('awaitmsg_locale');
    else window.localStorage.setItem('awaitmsg_locale', previousLocale);

    expect(screen.getByText('Отправить в')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Режим действия' })).getByRole('button', { name: 'Черновик' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить тип напоминания' }));

    const reminderTypeGroup = screen.getByRole('group', { name: 'Тип напоминания' });
    ['Без типа', 'Задача', 'Встреча', 'Напоминание', 'Событие', 'Идея'].forEach((label) => {
      expect(within(reminderTypeGroup).getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('dismisses sent History rows in preview without mutating shared History', () => {
    const today = new Date().toISOString();
    const earlier = '2020-02-03T10:00:00.000Z';
    const sentHistory = normalizeScheduledMessages([
      {
        id: 'actual-today',
        chatId: 'chat-1',
        chatName: 'Alpha Team',
        text: 'Actual sent message',
        when: today,
        sentAt: today,
        createdAt: today,
        status: 'sent',
      },
      {
        id: 'actual-earlier',
        chatId: 'chat-2',
        chatName: 'Beta Channel',
        text: 'Older sent message',
        when: earlier,
        sentAt: earlier,
        createdAt: earlier,
        status: 'sent',
      },
    ], 'personal', 'sent', []);
    const sharedHistory = sentHistory.map((record) => ({ ...record }));
    const { container } = renderQuickPlanner({ sentHistory });
    const panel = container.querySelector<HTMLElement>('.quick-planner-upcoming-column')!;

    expect(within(panel).getByText('Actual sent message')).toBeInTheDocument();
    expect(within(panel).getByText('Older sent message')).toBeInTheDocument();
    expect(within(panel).queryByText('Release notes are ready for review.')).not.toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'Earlier' })).toBeInTheDocument();

    const actualRow = screen.getByText('Actual sent message').closest<HTMLElement>('.quick-planner-mode-preview-row')!;
    fireEvent.mouseEnter(actualRow);
    fireEvent.click(within(actualRow).getByRole('button', { name: /Delete history message from Alpha Team/ }));

    expect(screen.queryByText('Actual sent message')).not.toBeInTheDocument();
    expect(sentHistory).toEqual(sharedHistory);
    expect(sentHistory).toHaveLength(2);
    expect(sentHistory[0].text).toBe('Actual sent message');
  });

  it('opens a History message full-width and closes it with Escape', () => {
    renderQuickPlanner();
    fireEvent.click(screen.getByText('Release notes are ready for review.'));

    const dialog = screen.getByRole('dialog', { name: 'Release notes are ready for review.' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).toHaveClass('quick-planner-upcoming-column');
    expect(within(dialog).getByText('Release notes are ready for review.')).toBeInTheDocument();
    expect(getCssRules('.quick-planner-full-message')[0]).toMatch(/position:\s*absolute/);
    expect(getCssRules('.quick-planner-full-message')[0]).toMatch(/inset:\s*0/);
    expect(getCssRules('.quick-planner-full-message')[0]).toMatch(/background:\s*#05080b/);
    expect(getCssRules('.quick-planner-full-message-text')[0]).toMatch(/width:\s*100%/);
    expect(getCssRules('.quick-planner-full-message-text')[0]).toMatch(/font-size:\s*14px/);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a Queue message by keyboard and closes it with the close button', () => {
    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    const row = screen.getByText('Share the release notes.').closest<HTMLElement>('.quick-planner-mode-preview-row')!;

    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    const dialog = screen.getByRole('dialog', { name: 'Share the release notes.' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close full message' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores an expanded History message after reload when History arrives late', () => {
    const sentHistory = normalizeScheduledMessages([{
      id: 'reload-history-record',
      chatId: 'chat-1',
      chatName: 'Test chat',
      text: 'History restored after reload',
      when: '2026-10-14T09:00:00.000Z',
      sentAt: '2026-10-14T09:00:00.000Z',
      createdAt: '2026-10-14T09:00:00.000Z',
      status: 'sent',
    }], 'personal', 'sent', []);
    localStorage.setItem(plannerPreviewStorageKey, JSON.stringify({ expandedPreviewMessageId: sentHistory[0].id }));

    const { updateSentHistory } = renderQuickPlanner({ sentHistory: [] });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(plannerPreviewStorageKey) || '{}').expandedPreviewMessageId).toBe(sentHistory[0].id);
    act(() => updateSentHistory?.(sentHistory));

    expect(screen.getByRole('dialog', { name: 'History restored after reload' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores Queue mode, pin, cancellation, and expanded preview across reloads', () => {
    const firstRender = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pin queued message from Saved Messages at 16:30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scheduled message to Product team at 16:20' }));
    fireEvent.click(screen.getByText('Share the release notes.'));
    firstRender.unmount();

    const restored = renderQuickPlanner();
    expect(screen.getByRole('button', { name: 'Schedule' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('dialog', { name: 'Share the release notes.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpin queued message from Saved Messages at 16:30' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Follow up on open questions.')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Share the release notes.'));
    fireEvent.click(screen.getByRole('button', { name: 'Close full message' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    restored.unmount();
    renderQuickPlanner();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpin queued message from Saved Messages at 16:30' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pins and deletes only local History preview rows', () => {
    const { container } = renderQuickPlanner();
    const firstRow = container.querySelector<HTMLElement>('.quick-planner-mode-preview-row')!;

    fireEvent.mouseEnter(firstRow);
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Pin history message from Saved Messages at 14:32' }));
    expect(screen.getByRole('button', { name: 'Unpin history message from Saved Messages at 14:32' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Delete history message from Saved Messages at 14:32' }));

    expect(screen.queryByText('Release notes are ready for review.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.quick-planner-mode-preview-row')).toHaveLength(8);
  });

  it('pins and cancels only local Queue preview rows', () => {
    const { container } = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    const firstRow = container.querySelector<HTMLElement>('.quick-planner-mode-preview-row')!;

    fireEvent.mouseEnter(firstRow);
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Pin queued message from Saved Messages at 16:30' }));
    expect(screen.getByRole('button', { name: 'Unpin queued message from Saved Messages at 16:30' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scheduled message to Saved Messages at 16:30' }));

    expect(screen.queryByText('Share the release notes.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.quick-planner-mode-preview-row')).toHaveLength(8);
  });

  it('moves a pinned History row above the dates and restores its position when unpinned', () => {
    const { container } = renderQuickPlanner();
    const originalRow = screen.getByText('The sprint notes are ready.').closest<HTMLElement>('.quick-planner-mode-preview-row')!;

    fireEvent.mouseEnter(originalRow);
    fireEvent.click(within(originalRow).getByRole('button', { name: 'Pin history message from Product team at 08:20' }));
    expect(within(screen.getByRole('region', { name: 'Pinned' })).getByText('The sprint notes are ready.')).toBeInTheDocument();
    expect(container.querySelector('.quick-planner-mode-preview-group-label')).toHaveTextContent('Pinned');

    fireEvent.click(screen.getByRole('button', { name: 'Unpin history message from Product team at 08:20' }));
    expect(screen.queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument();
    const yesterdayRows = within(screen.getByRole('region', { name: 'Yesterday' })).getAllByRole('listitem');
    expect(yesterdayRows[2]).toHaveTextContent('The sprint notes are ready.');
  });

  it('moves a pinned Queue row above the dates and restores its position when unpinned', () => {
    const { container } = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    const originalRow = screen.getByText('Follow up on open questions.').closest<HTMLElement>('.quick-planner-mode-preview-row')!;

    fireEvent.mouseEnter(originalRow);
    fireEvent.click(within(originalRow).getByRole('button', { name: 'Pin queued message from Product team at 16:20' }));
    expect(within(screen.getByRole('region', { name: 'Pinned' })).getByText('Follow up on open questions.')).toBeInTheDocument();
    expect(container.querySelector('.quick-planner-mode-preview-group-label')).toHaveTextContent('Pinned');

    fireEvent.click(screen.getByRole('button', { name: 'Unpin queued message from Product team at 16:20' }));
    expect(screen.queryByRole('region', { name: 'Pinned' })).not.toBeInTheDocument();
    const tomorrowRows = within(screen.getByRole('region', { name: 'Tomorrow' })).getAllByRole('listitem');
    expect(tomorrowRows[2]).toHaveTextContent('Follow up on open questions.');
  });

  it('pluralizes the Draft heading when at least two drafts are saved', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([
      { id: 'draft-one', message: 'First draft', attachments: [], entities: [], reminderType: null, savedAt: '' },
      { id: 'draft-two', message: 'Second draft', attachments: [], entities: [], reminderType: null, savedAt: '' },
    ]));
    const { container } = renderQuickPlanner();
    selectDraftMode();

    expect(container.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('Drafts');
  });

  it('localizes the saved drafts pane in Russian', () => {
    const previousLocale = localStorage.getItem('awaitmsg_locale');
    localStorage.setItem('awaitmsg_locale', 'ru');
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([
      { id: 'draft-one', message: 'Идея', attachments: [], entities: [], reminderType: null, savedAt: '2026-10-14T12:00:00.000Z' },
      { id: 'draft-two', message: '', attachments: ['C:/drafts/brief.pdf'], entities: [], reminderType: null, savedAt: '' },
    ]));
    const { container } = renderQuickPlanner();
    if (previousLocale === null) localStorage.removeItem('awaitmsg_locale');
    else localStorage.setItem('awaitmsg_locale', previousLocale);
    fireEvent.click(within(screen.getByRole('group', { name: 'Режим действия' })).getByRole('button', { name: 'Черновик' }));

    const draftsPane = container.querySelector('.quick-planner-upcoming') as HTMLElement;
    const draftsList = within(draftsPane).getByRole('list', { name: 'Черновики Планера' });
    const firstDraft = within(draftsList).getByRole('listitem', { name: 'Открыть черновик: Идея' });

    expect(within(draftsPane).getByText('Черновики')).toBeInTheDocument();
    expect(within(draftsPane).getByText('Идеи и Студия · 2')).toBeInTheDocument();
    expect(within(firstDraft).getByText('Сохранённый черновик 2')).toBeInTheDocument();
    expect(within(firstDraft).getByText(new Date('2026-10-14T12:00:00.000Z').toLocaleString('ru-RU'))).toBeInTheDocument();
    expect(within(firstDraft).getByRole('checkbox', { name: 'Выбрать черновик: Идея' })).toBeInTheDocument();
    expect(within(firstDraft).getByRole('button', { name: 'Открыть черновик в Студии: Идея' })).toBeInTheDocument();
    expect(within(firstDraft).getByRole('button', { name: 'Закрепить черновик: Идея' })).toBeInTheDocument();
    expect(within(firstDraft).getByRole('button', { name: 'Удалить черновик: Идея' })).toBeInTheDocument();
    expect(within(draftsList).getByRole('listitem', { name: 'Открыть черновик: Черновик с 1 вложением' })).toBeInTheDocument();
    const openSelectedDrafts = within(container).getByRole('button', { name: 'Открыть выбранные черновики в Студии: 0' });
    expect(openSelectedDrafts).toBeInTheDocument();
    expect(within(container).getByText('Открыть черновики в Студии')).toBeInTheDocument();
    expect(container.querySelector('[role="scrollbar"]')).toHaveAttribute('aria-label', 'Прокрутить черновики');

    fireEvent.click(openSelectedDrafts);
    expect(within(container).getByRole('status')).toHaveTextContent('Выберите черновик или создайте заметку');
  });

  it('shows the Quick Planner draft instead of scheduled messages in Ideas Space', () => {
    const scheduled: ScheduledMessage = {
      id: 'scheduled-not-a-planner-draft',
      chatId: 'chat-1',
      chatName: 'Test chat',
      text: 'Already scheduled message',
      when: '2035-01-15T17:42:00.000Z',
      createdAt: '2035-01-15T16:42:00.000Z',
      status: 'scheduled',
    };
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      message: 'Draft created in Quick Planner',
      attachments: [],
      entities: [],
      reminderType: null,
    }));
    const { container } = renderQuickPlanner({ message: 'Unsaved editor text', upcoming: [scheduled] });
    selectDraftMode();
    const ideasSpace = container.querySelector('.quick-planner-upcoming');

    expect(within(ideasSpace as HTMLElement).getByText('Draft created in Quick Planner')).toBeInTheDocument();
    expect(within(ideasSpace as HTMLElement).queryByText('Unsaved editor text')).not.toBeInTheDocument();
    expect(within(ideasSpace as HTMLElement).getByText('Saved draft')).toBeInTheDocument();
    expect(within(ideasSpace as HTMLElement).queryByText('Already scheduled message')).not.toBeInTheDocument();
    expect(within(ideasSpace as HTMLElement).queryByRole('button', { name: /Cancel scheduled message/ })).not.toBeInTheDocument();
  });

  it('shows attachment-only Quick Planner drafts in Ideas Space', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      message: '',
      attachments: ['C:/drafts/planner-idea.pdf'],
      entities: [],
      reminderType: null,
    }));
    renderQuickPlanner();
    selectDraftMode();

    expect(screen.getByText('planner-idea.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel scheduled message/ })).not.toBeInTheDocument();
  });

  it('places a compact colored reminder tag beside the saved date', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([{
      id: 'tagged-draft',
      message: 'Tagged draft',
      attachments: [],
      entities: [],
      reminderType: 'meeting',
      savedAt: '2026-10-13T10:00:00.000Z',
    }]));
    const { container } = renderQuickPlanner();
    selectDraftMode();
    const card = container.querySelector('.quick-planner-draft')!;
    const info = card.querySelector('.quick-planner-draft-info')!;
    const tag = info.querySelector('.quick-planner-draft-tag')!;

    expect(info.querySelector('time')).toBeInTheDocument();
    expect(tag).toHaveAttribute('data-reminder-type', 'meeting');
    expect(getCssRules('.quick-planner-draft small.quick-planner-draft-tag')[0]).toMatch(/min-height:\s*20px/);
    expect(getCssRules('.quick-planner-draft-tag[data-reminder-type="meeting"]')[0]).toMatch(/color:\s*#a8d8ff/);
  });

  it('syncs saved drafts added from Posts back into Ideas Space', () => {
    const { container } = renderQuickPlanner();
    selectDraftMode();
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([{
      id: 'posts-added-draft',
      message: 'Draft added from Posts',
      attachments: [],
      entities: [],
      reminderType: 'idea',
      savedAt: '2026-10-13T10:00:00.000Z',
    }]));

    act(() => window.dispatchEvent(new Event(SAVED_PLANNER_DRAFTS_UPDATED_EVENT)));

    expect(within(container.querySelector('.quick-planner-upcoming')!).getByText('Draft added from Posts')).toBeInTheDocument();
  });

  it('hides native draft scrollbar arrows and uses a hand cursor for the draggable thumb', () => {
    const reminderListRules = getCssRules('.quick-planner-reminder-list')[0];
    const scrollbarRules = getCssRules('.quick-planner-reminder-list::-webkit-scrollbar')[0];
    const thumbRules = getCssRules('.quick-planner-draft-scrollbar-thumb')[0];
    const activeThumbRules = getCssRules('.quick-planner-draft-scrollbar-thumb:active')[0];

    expect(reminderListRules).toMatch(/scrollbar-width:\s*none/);
    expect(scrollbarRules).toMatch(/display:\s*none/);
    expect(getCssRules('.quick-planner-page .quick-planner-draft-select input[type="checkbox"]')[0]).toMatch(/width:\s*20px/);
    expect(getCssRules('.quick-planner-page .quick-planner-draft-select input[type="checkbox"]')[0]).toMatch(/height:\s*20px/);
    expect(getCssRules('.quick-planner-page .quick-planner-draft-select input[type="checkbox"]')[0]).toMatch(/appearance:\s*none/);
    expect(getCssRules('.quick-planner-page .quick-planner-draft-select input[type="checkbox"]:checked')[0]).toMatch(/background:\s*#f3f6fa/);
    expect(getCssRules('.quick-planner-draft.is-selected')).toHaveLength(0);
    expect(thumbRules).toMatch(/cursor:\s*grab/);
    expect(activeThumbRules).toMatch(/cursor:\s*grabbing/);
  });

  it('drags the custom hand scrollbar to scroll through drafts', () => {
    const { container } = renderQuickPlanner();
    selectDraftMode();
    const list = container.querySelector('.quick-planner-reminder-list') as HTMLDivElement;
    const track = container.querySelector('.quick-planner-draft-scrollbar') as HTMLDivElement;
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
    });
    Object.defineProperty(track, 'clientHeight', { configurable: true, value: 300 });

    fireEvent.scroll(list);
    const scrollbar = screen.getByRole('scrollbar', { name: 'Scroll drafts' });
    scrollbar.setPointerCapture = vi.fn();
    fireEvent.pointerDown(scrollbar, { button: 0, pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(scrollbar, { pointerId: 1, clientY: 75 });

    expect(list.scrollTop).toBeGreaterThan(0);
    expect(scrollbar.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('starts in Send now mode without connecting an action', () => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', 'send');
    expect(screen.getByRole('heading', { name: 'Quick Planner' })).toBeInTheDocument();
    expect(modeGroup.getByRole('button', { name: 'Send now' })).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.getByRole('button', { name: 'Schedule' })).toHaveAttribute('aria-pressed', 'false');
    expect(modeGroup.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'false');
    expect(modeGroup.getByText('Current action')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder' }).querySelector('svg')).toHaveClass('lucide-send');
    expect(screen.queryByRole('button', { name: 'Date, 12 / 10 / 2026' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Time, 09 : 30' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Send now')).toHaveLength(2);
    expect(container.querySelector('.quick-planner-repeat')).not.toBeInTheDocument();
  });

  it('queues a saved draft and keeps its tag, deletion, and Studio action below the card', () => {
    const onOpenInStudio = vi.fn();
    const onSaveDraft = vi.fn();
    const { container, unmount } = renderQuickPlanner({
      message: 'A note to keep',
      entities: [{ type: 'bold', offset: 0, length: 1 }],
      attachments: ['C:/drafts/reference.pdf'],
      onOpenInStudio,
      onSaveDraft,
    });
    const modes = within(screen.getByRole('group', { name: 'Action mode' }));

    fireEvent.click(modes.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder type' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Reminder type' })).getByRole('button', { name: 'Task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(onSaveDraft).toHaveBeenCalledWith('A note to keep', ['C:/drafts/reference.pdf'], [{ type: 'bold', offset: 0, length: 1 }], 'task');
    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('');
    expect(screen.queryByText('Draft saved.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByText('A note to keep')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('reference.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete draft A note to keep' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove reference.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select draft A note to keep' })).not.toBeChecked();

    const panel = container.querySelector('.quick-planner-upcoming');
    const openInStudio = screen.getByRole('button', { name: 'Open 0 selected drafts in Studio' });
    expect(panel?.contains(openInStudio)).toBe(false);
    expect(openInStudio.parentElement).toHaveClass('quick-planner-open-studio-footer');
    expect(openInStudio.parentElement?.parentElement).toHaveClass('quick-planner-upcoming-column');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft A note to keep' }));
    const selectedOpenInStudio = screen.getByRole('button', { name: 'Open 1 selected draft in Studio' });
    fireEvent.click(selectedOpenInStudio);
    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'A note to keep',
      attachments: ['C:/drafts/reference.pdf'],
      entities: [{ type: 'bold', offset: 0, length: 1 }],
    });

    unmount();
    renderQuickPlanner();
    selectDraftMode();
    expect(screen.getByText('A note to keep')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
  });

  it('navigates directly to Studio, Posts, and Settings from the workspace menu', () => {
    const onOpenInStudio = vi.fn();
    const navigationActions = {
      currentSection: 'quick-plan' as const,
      openQuickPlan: vi.fn(),
      openStudio: vi.fn(),
      openPosts: vi.fn(),
      openSettings: vi.fn(),
    };
    renderQuickPlanner({ message: 'A saved note', onOpenInStudio }, navigationActions);
    const navigation = within(screen.getByRole('navigation', { name: 'Workspace navigation' }));

    fireEvent.click(navigation.getByRole('button', { name: 'Studio' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Posts' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Settings' }));

    expect(navigationActions.openQuickPlan).not.toHaveBeenCalled();
    expect(navigationActions.openStudio).toHaveBeenCalledOnce();
    expect(onOpenInStudio).not.toHaveBeenCalled();
    expect(navigationActions.openPosts).toHaveBeenCalledOnce();
    expect(navigationActions.openSettings).toHaveBeenCalledOnce();
  });

  it('opens the Studio section when Studio is selected with an empty draft', () => {
    const navigationActions = {
      currentSection: 'quick-plan' as const,
      openQuickPlan: vi.fn(),
      openStudio: vi.fn(),
      openPosts: vi.fn(),
      openSettings: vi.fn(),
    };
    renderQuickPlanner({}, navigationActions);

    fireEvent.click(screen.getByRole('button', { name: 'Studio' }));

    expect(navigationActions.openStudio).toHaveBeenCalledOnce();
  });

  it('tracks reminder text and clears it and its formatting entities', () => {
    const onEntitiesChange = vi.fn();
    renderQuickPlanner({
      message: 'Call the dentist',
      entities: [{ type: 'bold', offset: 0, length: 4 }],
      onEntitiesChange,
    });
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    expect(textField).toHaveAttribute('maxLength', '1023');
    fireEvent.change(textField, { target: { value: 'Call the dentist' } });

    expect(screen.getByText('16 / 1023')).toBeInTheDocument();
    fireEvent.change(textField, { target: { value: 'x'.repeat(1023) } });
    expect(screen.getByText('1023 / 1023')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear reminder text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));

    expect(textField).toHaveValue('');
    expect(onEntitiesChange).toHaveBeenCalledWith([]);
    expect(screen.getByText('0 / 1023')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reminder text' })).not.toBeInTheDocument();
  });

  it('allows native Ctrl+C copying from the reminder editor', () => {
    renderQuickPlanner({ message: 'Copy this reminder' });
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    const copyEvent = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
    const textFieldRules = getCssRules('.quick-planner-compose textarea')[0];

    textField.dispatchEvent(copyEvent);

    expect(copyEvent.defaultPrevented).toBe(false);
    expect(textFieldRules).toMatch(/-webkit-user-select:\s*text/);
    expect(textFieldRules).toMatch(/user-select:\s*text/);
  });

  it('anchors the reminder counter inside the compose rail for long counts', () => {
    const counterRules = getCssRules('.quick-planner-counter')[0];

    expect(counterRules).toMatch(/right:\s*-10px/);
    expect(counterRules).toMatch(/left:\s*auto/);
    expect(counterRules).toMatch(/width:\s*max-content/);
    expect(counterRules).toMatch(/text-align:\s*right/);
  });

  it('shows attachment names without a duplicate native tooltip', () => {
    renderQuickPlanner({ attachments: ['C:/photos/family-photo.png'] });

    expect(screen.getByText('family-photo.png')).not.toHaveAttribute('title');
    expect(screen.getByRole('button', { name: 'Remove family-photo.png' })).toBeInTheDocument();
  });

  it('preserves a new draft entered while send is in flight', async () => {
    let resolveSend!: (sent: boolean) => void;
    const sendPromise = new Promise<boolean>((resolve) => { resolveSend = resolve; });
    renderQuickPlanner({
      message: 'First draft',
      attachments: ['first.pdf'],
      onSendNow: vi.fn(() => sendPromise),
    });

    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    fireEvent.change(textField, { target: { value: 'Next draft' } });

    await act(async () => {
      resolveSend(true);
      await sendPromise;
    });

    expect(textField).toHaveValue('Next draft');
    expect(screen.getByRole('button', { name: 'Remove first.pdf' })).toBeInTheDocument();
  });

  it('preserves the draft if the selected chat changes while send is in flight', async () => {
    let resolveSend!: (sent: boolean) => void;
    const sendPromise = new Promise<boolean>((resolve) => { resolveSend = resolve; });
    const { updateSelectedChat } = renderQuickPlanner({
      message: 'Keep this draft',
      onSendNow: vi.fn(() => sendPromise),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    updateSelectedChat({ id: 'chat-2', name: 'Another chat' });

    await act(async () => {
      resolveSend(true);
      await sendPromise;
    });

    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('Keep this draft');
  });

  it('preserves the draft if the selected chat changes while scheduling', async () => {
    let resolveSchedule!: () => void;
    const schedulePromise = new Promise<void>((resolve) => { resolveSchedule = resolve; });
    const onSchedule = vi.fn<ComponentProps<typeof QuickPlannerPage>['onSchedule']>(() => schedulePromise);
    const { updateSelectedChat, updateUpcoming } = renderQuickPlanner({
      message: 'Keep this scheduled draft',
      onSchedule,
    });

    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule reminder' }));
    const scheduledPayload = onSchedule.mock.calls[0][0];
    updateSelectedChat({ id: 'chat-2', name: 'Another chat' });

    await act(async () => {
      updateUpcoming?.([{
        id: 'scheduled-for-original-chat',
        chatId: scheduledPayload.chatId,
        chatName: 'Test chat',
        text: 'Keep this scheduled draft',
        when: new Date(`${scheduledPayload.date}T${scheduledPayload.time}`).toISOString(),
        createdAt: new Date().toISOString(),
        status: 'scheduled',
      }]);
      resolveSchedule();
      await schedulePromise;
    });

    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('Keep this scheduled draft');
  });

  it('preserves replacement attachments when a pending schedule is recorded', async () => {
    let resolveSchedule!: () => void;
    const schedulePromise = new Promise<void>((resolve) => { resolveSchedule = resolve; });
    const onSchedule = vi.fn<ComponentProps<typeof QuickPlannerPage>['onSchedule']>(() => schedulePromise);
    const { updateUpcoming } = renderQuickPlanner({
      message: 'Schedule this note',
      attachments: ['original.pdf'],
      onSchedule,
    });

    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule reminder' }));
    expect(onSchedule).toHaveBeenCalledOnce();

    const payload = onSchedule.mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', { name: 'Remove original.pdf' }));
    fireEvent.change(screen.getByLabelText('Planner attachment files'), {
      target: { files: [new File(['replacement'], 'replacement.pdf', { type: 'application/pdf' })] },
    });

    await act(async () => {
      updateUpcoming?.([{
        id: 'scheduled-from-original-draft',
        chatId: payload.chatId,
        chatName: 'Test chat',
        text: 'Schedule this note',
        attachments: ['original.pdf'],
        when: new Date(`${payload.date}T${payload.time}`).toISOString(),
        createdAt: new Date().toISOString(),
        status: 'scheduled',
      }]);
      resolveSchedule();
      await schedulePromise;
    });

    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('Schedule this note');
    expect(screen.getByRole('button', { name: 'Remove replacement.pdf' })).toBeInTheDocument();
  });

  it('shows a selection prompt only after the Studio button is clicked without a selection', () => {
    const onOpenInStudio = vi.fn();
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      message: 'Saved planner note',
      attachments: [],
      entities: [],
      reminderType: null,
    }));
    renderQuickPlanner({ onOpenInStudio });
    selectDraftMode();

    const openButton = screen.getByRole('button', { name: 'Open 0 selected drafts in Studio' });
    expect(openButton).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(openButton);
    expect(screen.getByRole('status')).toHaveTextContent('Select a draft or create a note');
    expect(onOpenInStudio).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft Saved planner note' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const draftSelector = screen.getByRole('checkbox', { name: 'Deselect draft Saved planner note' });
    expect(draftSelector).toBeChecked();
    fireEvent.click(draftSelector);
    expect(draftSelector).not.toBeChecked();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open 0 selected drafts in Studio' }));
    expect(screen.getByRole('status')).toHaveTextContent('Select a draft or create a note');
    const unselectedDraft = screen.getByRole('checkbox', { name: 'Select draft Saved planner note' });
    fireEvent.click(unselectedDraft);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const selectedButton = screen.getByRole('button', { name: 'Open 1 selected draft in Studio' });
    expect(selectedButton).toBeEnabled();
    fireEvent.click(selectedButton);

    expect(onOpenInStudio).toHaveBeenCalledWith({ text: 'Saved planner note', attachments: [], entities: [] });
    expect(screen.queryByRole('button', { name: /Cancel scheduled message/ })).not.toBeInTheDocument();

    localStorage.removeItem(savedPlannerDraftStorageKey);
    const emptyRender = renderQuickPlanner();
    fireEvent.click(within(emptyRender.container).getByRole('button', { name: 'Draft' }));
    expect(within(emptyRender.container).getByRole('button', { name: 'Open 0 selected drafts in Studio' })).toBeEnabled();
    expect(within(emptyRender.container).queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens a saved draft from its row and selects it only with the checkbox', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      message: 'Saved planner note',
      attachments: [],
      entities: [],
      reminderType: null,
    }));
    const { container } = renderQuickPlanner();
    selectDraftMode();
    const draftCard = container.querySelector<HTMLElement>('.quick-planner-draft')!;

    fireEvent.click(screen.getByText('Saved planner note'));
    expect(screen.getByRole('dialog', { name: 'Saved planner note' })).toBeInTheDocument();
    expect(within(draftCard).getByRole('checkbox', { name: 'Select draft Saved planner note' })).not.toBeChecked();
    expect(draftCard).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft Saved planner note' }));
    expect(within(draftCard).getByRole('checkbox', { name: 'Deselect draft Saved planner note' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect draft Saved planner note' }));

    expect(within(draftCard).getByRole('checkbox', { name: 'Select draft Saved planner note' })).not.toBeChecked();
    expect(draftCard).not.toHaveClass('is-selected');
    fireEvent.mouseEnter(draftCard);
    fireEvent.click(within(draftCard).getByRole('button', { name: 'Pin draft Saved planner note' }));

    expect(within(draftCard).getByRole('button', { name: 'Unpin draft Saved planner note' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(draftCard).getByRole('checkbox', { name: 'Select draft Saved planner note' })).not.toBeChecked();

    fireEvent.click(screen.getByText('Saved planner note'));
    fireEvent.click(screen.getByRole('button', { name: 'Close full message' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores an expanded saved Draft after reload and closes it with Escape', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      id: 'reload-expanded-draft',
      message: 'A saved draft should reopen in full.',
      attachments: [],
      entities: [],
      reminderType: null,
      savedAt: '2026-10-14T10:00:00.000Z',
    }));
    const firstRender = renderQuickPlanner();
    selectDraftMode();
    fireEvent.click(screen.getByText('A saved draft should reopen in full.'));
    firstRender.unmount();

    renderQuickPlanner();

    expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('dialog', { name: 'A saved draft should reopen in full.' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects multiple drafts, shows their count, and combines them for Studio', () => {
    const onOpenInStudio = vi.fn();
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([
      {
        id: 'first-batch-draft',
        message: 'First note',
        attachments: ['C:/drafts/first.pdf'],
        entities: [{ type: 'bold', offset: 0, length: 5 }],
        reminderType: null,
        savedAt: '2026-10-13T10:00:00.000Z',
      },
      {
        id: 'second-batch-draft',
        message: 'Second note',
        attachments: ['C:/drafts/second.pdf'],
        entities: [{ type: 'italic', offset: 0, length: 6 }],
        reminderType: null,
        savedAt: '2026-10-13T09:00:00.000Z',
      },
    ]));
    const { container } = renderQuickPlanner({ onOpenInStudio });
    selectDraftMode();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft First note' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft Second note' }));

    const openButton = screen.getByRole('button', { name: 'Open 2 selected drafts in Studio' });
    expect(screen.getByText('2', { selector: '.quick-planner-open-studio-count' })).toBeInTheDocument();
    expect(container.querySelector('.quick-planner-open-studio-footer')).toHaveClass('has-multiple-drafts');
    fireEvent.click(openButton);

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'First note\n\nSecond note',
      attachments: ['C:/drafts/first.pdf', 'C:/drafts/second.pdf'],
      entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'italic', offset: 12, length: 6 },
      ],
    });
  });

  it('opens one saved draft in Studio without removing it from the draft list', () => {
    const onOpenInStudio = vi.fn();
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      id: 'studio-transfer-draft',
      message: 'Move this note',
      attachments: ['C:/drafts/brief.pdf'],
      entities: [{ type: 'bold', offset: 0, length: 4 }],
      reminderType: null,
      savedAt: '2026-10-13T10:00:00.000Z',
    }));
    renderQuickPlanner({ onOpenInStudio });
    selectDraftMode();

    const draftCard = screen.getByText('Move this note').closest<HTMLElement>('.quick-planner-draft')!;
    fireEvent.mouseEnter(draftCard);
    fireEvent.click(screen.getByRole('button', { name: 'Open draft in Studio Move this note' }));

    expect(onOpenInStudio).toHaveBeenCalledWith({
      text: 'Move this note',
      attachments: ['C:/drafts/brief.pdf'],
      entities: [{ type: 'bold', offset: 0, length: 4 }],
    });
    expect(screen.getByText('Move this note')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select draft Move this note' })).not.toBeChecked();
  });

  it('automatically hides the draft selection hint after three seconds', () => {
    vi.useFakeTimers();
    try {
      renderQuickPlanner();
      selectDraftMode();
      fireEvent.click(screen.getByRole('button', { name: 'Open 0 selected drafts in Studio' }));
      expect(screen.getByRole('status')).toHaveTextContent('Select a draft or create a note');

      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.getByRole('status')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps multiple created drafts in the queue and removes only the deleted draft', () => {
    const { container } = renderQuickPlanner({ message: 'First queued note' });
    const modes = within(screen.getByRole('group', { name: 'Action mode' }));
    fireEvent.click(modes.getByRole('button', { name: 'Draft' }));
    const saveDraft = () => fireEvent.click(container.querySelector('.quick-planner-send') as HTMLButtonElement);
    saveDraft();

    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Second queued note' },
    });
    saveDraft();

    expect(screen.getByText('First queued note')).toBeInTheDocument();
    expect(screen.getByText('Second queued note')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select draft First queued note' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select draft Second queued note' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select draft Second queued note' }));
    expect(screen.getByRole('checkbox', { name: 'Deselect draft Second queued note' })).toBeChecked();

    fireEvent.mouseEnter(screen.getByText('Second queued note').closest('.quick-planner-draft')!);
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft Second queued note' }));
    expect(screen.queryByText('Second queued note')).not.toBeInTheDocument();
    expect(screen.getByText('First queued note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open 0 selected drafts in Studio' })).toBeEnabled();
  });

  it('pins important drafts at the top and restores their pinned state', () => {
    const { container, unmount } = renderQuickPlanner({ message: 'First queued note' });
    const modes = within(screen.getByRole('group', { name: 'Action mode' }));
    fireEvent.click(modes.getByRole('button', { name: 'Draft' }));
    const saveDraft = () => fireEvent.click(container.querySelector('.quick-planner-send') as HTMLButtonElement);
    saveDraft();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reminder text' }), {
      target: { value: 'Second queued note' },
    });
    saveDraft();

    fireEvent.mouseEnter(screen.getByText('First queued note').closest('.quick-planner-draft')!);
    fireEvent.click(screen.getByRole('button', { name: 'Pin draft First queued note' }));

    const getDraftOrder = () => [...container.querySelectorAll('.quick-planner-draft > span')]
      .map((draft) => draft.textContent);
    expect(getDraftOrder()).toEqual(['First queued note', 'Second queued note']);
    expect(screen.getByRole('button', { name: 'Unpin draft First queued note' })).toHaveAttribute('aria-pressed', 'true');

    const storedDrafts = JSON.parse(localStorage.getItem(savedPlannerDraftStorageKey) || '[]');
    expect(storedDrafts[0]).toMatchObject({ message: 'First queued note', pinned: true });

    unmount();
    const restored = renderQuickPlanner();
    selectDraftMode();
    expect([...restored.container.querySelectorAll('.quick-planner-draft > span')].map((draft) => draft.textContent))
      .toEqual(['First queued note', 'Second queued note']);
    expect(screen.getByRole('button', { name: 'Unpin draft First queued note' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['Schedule', 'schedule'],
    ['Draft', 'draft'],
  ])('selecting %s only updates the visual mode', (label, mode) => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    fireEvent.click(modeGroup.getByRole('button', { name: label }));

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', mode);
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
    expect(modeGroup.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(modeGroup.getAllByText(label)).toHaveLength(1);
    const actionButtonName = mode === 'schedule' ? 'Schedule reminder' : 'Save draft';
    const actionIconClass = mode === 'schedule' ? 'lucide-calendar-days' : 'lucide-file-text';
    expect(screen.getByRole('button', { name: actionButtonName }).querySelector('svg')).toHaveClass(actionIconClass);
    expect(container.querySelector('.quick-planner-date-time')).not.toBeInTheDocument();
  });
});

describe('QuickPlannerPage schedule date and time pickers', () => {
  function openScheduleControls() {
    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Schedule' }));
    return within(screen.getByRole('group', { name: 'Schedule date and time' }));
  }

  it('keeps the pills visually still while typing by dropping the focus highlight', () => {
    expect(plannerStyles).not.toContain('.quick-planner-schedule-controls label:focus-within');
    expect(getCssRules('.quick-planner-schedule-controls label:hover')[0]).toMatch(/background:.*0\.22/);
    expect(getCssRules('.quick-planner-schedule-controls label > svg')[0]).toMatch(/cursor:\s*pointer/);
  });

  it('shows the date as an editable field and keeps time read-only until its picker opens', () => {
    const controls = openScheduleControls();
    const dateInput = controls.getByLabelText('Schedule date') as HTMLInputElement;
    const timeValue = controls.getByLabelText('Schedule time');

    expect(dateInput).toHaveAttribute('type', 'text');
    expect(dateInput).toHaveAttribute('inputmode', 'numeric');
    expect(dateInput.value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(timeValue.tagName).toBe('SPAN');
    expect(timeValue).toHaveTextContent(/^\d{2}:\d{2}$/);

    fireEvent.click(controls.getByRole('button', { name: 'Open date picker' }));
    expect(screen.queryByLabelText('Enter schedule time')).not.toBeInTheDocument();

    fireEvent.click(controls.getByRole('button', { name: 'Open date picker' }));
    fireEvent.click(controls.getByRole('button', { name: 'Open time picker' }));
    expect(screen.getByLabelText('Enter schedule time')).toBeInTheDocument();
  });

  it('opens the minimal date calendar from the calendar icon and applies a picked day', () => {
    const controls = openScheduleControls();

    fireEvent.click(controls.getByRole('button', { name: 'Open date picker' }));
    const dialog = screen.getByRole('dialog', { name: 'Schedule date picker' });

    expect(within(dialog).getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: '15' })).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next month' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next month' }));
    const futureDay = within(screen.getByRole('dialog', { name: 'Schedule date picker' })).getAllByRole('button', { name: '15' })[0];

    fireEvent.click(futureDay);

    expect(screen.queryByRole('dialog', { name: 'Schedule date picker' })).not.toBeInTheDocument();
    const pickedDateInput = within(screen.getByRole('group', { name: 'Schedule date and time' })).getByLabelText('Schedule date') as HTMLInputElement;
    expect(pickedDateInput.value).toMatch(/^15\.\d{2}\.\d{4}$/);
  });

  it('anchors date and time popovers below their full fields', () => {
    const controls = openScheduleControls();
    const dateTrigger = controls.getByRole('button', { name: 'Open date picker' });
    const dateField = dateTrigger.closest('.quick-planner-schedule-date') as HTMLElement;
    vi.spyOn(dateField, 'getBoundingClientRect').mockReturnValue(new DOMRect(160, 100, 180, 40));
    const quickValues = screen.getByRole('group', { name: 'Quick schedule times' });
    vi.spyOn(quickValues, 'getBoundingClientRect').mockReturnValue(new DOMRect(160, 140, 480, 48));

    fireEvent.click(dateTrigger);
    const datePicker = screen.getByRole('dialog', { name: 'Schedule date picker' });
    expect(datePicker).toHaveStyle({ top: '208px', left: '160px' });

    fireEvent.click(dateTrigger);
    const timeTrigger = controls.getByRole('button', { name: 'Open time picker' });
    const timeField = timeTrigger.closest('.quick-planner-schedule-clock') as HTMLElement;
    vi.spyOn(timeField, 'getBoundingClientRect').mockReturnValue(new DOMRect(320, 140, 160, 40));
    vi.spyOn(quickValues, 'getBoundingClientRect').mockReturnValue(new DOMRect(160, 185, 480, 48));
    fireEvent.click(timeTrigger);

    const timePicker = screen.getByRole('dialog', { name: 'Schedule time picker' });
    expect(timePicker).toHaveStyle({ top: '253px', left: '320px' });
  });

  it('closes the date calendar on Escape', () => {
    const controls = openScheduleControls();

    fireEvent.click(controls.getByRole('button', { name: 'Open date picker' }));
    expect(screen.getByRole('dialog', { name: 'Schedule date picker' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Schedule date picker' })).not.toBeInTheDocument();
  });

  it('scrolls to the first available time when the displayed time is not selectable', () => {
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrolledElements: HTMLElement[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: function (this: HTMLElement) { scrolledElements.push(this); },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 13, 52));

    try {
      const controls = openScheduleControls();
      fireEvent.click(controls.getByRole('button', { name: 'Open time picker' }));

      const list = screen.getByRole('listbox', { name: 'Available times' });
      const firstAvailableOption = within(list).getAllByRole('option').find((option) => !option.hasAttribute('disabled'));
      expect(firstAvailableOption).toHaveTextContent('14:00');
      expect(scrolledElements).toEqual([firstAvailableOption]);
    } finally {
      if (previousScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      vi.useRealTimers();
    }
  });

  it('opens the minimal time list from the clock icon and applies the chosen slot', () => {
    const controls = openScheduleControls();

    fireEvent.click(controls.getByRole('button', { name: 'Open time picker' }));
    const list = screen.getByRole('listbox', { name: 'Available times' });
    const options = within(list).getAllByRole('option') as HTMLButtonElement[];

    expect(options).toHaveLength(96);
    const enabledOptions = options.filter((option) => !option.disabled);
    expect(enabledOptions.length).toBeGreaterThan(0);

    fireEvent.click(enabledOptions[enabledOptions.length - 1]);

    expect(screen.queryByRole('dialog', { name: 'Schedule time picker' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Schedule time')).toHaveTextContent(/^\d{2}:\d{2}$/);
  });

  it('inserts date and time straight from the clipboard', () => {
    const controls = openScheduleControls();

    fireEvent.paste(controls.getByLabelText('Schedule date'), { clipboardData: { getData: () => '2027-03-09' } });
    fireEvent.click(controls.getByRole('button', { name: 'Open time picker' }));
    fireEvent.paste(screen.getByLabelText('Enter schedule time'), { clipboardData: { getData: () => '9:05' } });

    expect(controls.getByLabelText('Schedule date')).toHaveValue('09.03.2027');
    expect(controls.getByLabelText('Schedule time')).toHaveTextContent('09:05');
  });

  it('formats typed digits into the date and time picker fields', () => {
    const controls = openScheduleControls();
    const dateInput = controls.getByLabelText('Schedule date') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: '1' } });
    expect(dateInput).toHaveValue('1');
    fireEvent.change(dateInput, { target: { value: '14102027' } });
    expect(dateInput).toHaveValue('14.10.2027');

    fireEvent.click(controls.getByRole('button', { name: 'Open time picker' }));
    const timeInput = screen.getByLabelText('Enter schedule time') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '1' } });
    expect(timeInput).toHaveValue('1');
    fireEvent.change(timeInput, { target: { value: '1656' } });
    expect(controls.getByLabelText('Schedule time')).toHaveTextContent('16:56');
  });

  it('anchors both pickers as fixed minimal popups with the planner theming', () => {
    expect(plannerStyles).toMatch(/\.quick-planner-date-picker,\s*\.quick-planner-time-picker\s*\{[^}]*position:\s*fixed/);
    expect(plannerStyles).toMatch(/\.quick-planner-time-list\s*\{[^}]*max-height:\s*212px/);
  });
});
