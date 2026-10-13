import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { SAVED_PLANNER_DRAFTS_UPDATED_EVENT, SAVED_PLANNER_DRAFT_STORAGE_KEY } from '@/lib/plannerDraft';
import type { ScheduledMessage } from '@/types';
import { QuickPlannerNavigationContext, type QuickPlannerNavigationActions } from '@/workspace/QuickPlannerNavigationContext';
import { QuickPlannerPage } from './QuickPlannerPage';

const plannerStyles = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'QuickPlannerPage.css'),
  'utf8',
);
const savedPlannerDraftStorageKey = SAVED_PLANNER_DRAFT_STORAGE_KEY;

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
  const Harness = () => {
    const [message, setMessage] = useState(props.message);
    const [entities, setEntities] = useState(props.entities);
    const [attachments, setAttachments] = useState(props.attachments);
    const [selectedChat, setSelectedChat] = useState(props.selectedChat);
    const [upcoming, setUpcoming] = useState(props.upcoming);
    updateSelectedChat = setSelectedChat;
    updateUpcoming = setUpcoming;
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
  };
}

beforeEach(() => {
  localStorage.removeItem('xmsgi-quick-planner-reminder-type');
  localStorage.removeItem('xmsgi-quick-planner-saved-draft');
});

describe('QuickPlannerPage layout positioning', () => {
  it('raises only the Current action caption by ten pixels', () => {
    const currentActionRules = getCssRules('.quick-planner-mode-switch > .quick-planner-mode-caption');

    expect(currentActionRules[0]).toMatch(/transform:\s*translateY\(-13px\)/);
    expect(currentActionRules.some((rules) => /font-size:\s*8px/.test(rules) && /letter-spacing:\s*0\.08em/.test(rules))).toBe(true);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*561px\)\s*and\s*\(max-width:\s*720px\)\s*\{\s*\.quick-planner-mode-switch\s*>\s*\.quick-planner-mode-caption\s*\{[^}]*font-size:\s*8px;[^}]*transform:\s*none;/);
  });

  it('keeps the emoji picker inside the composer and uses an emoji font', () => {
    const pickerRules = getCssRules('.quick-planner-emoji-picker')[0];
    const emojiButtonRules = getCssRules('.quick-planner-emoji-picker button')[0];

    expect(pickerRules).toMatch(/top:\s*8px/);
    expect(pickerRules).toMatch(/left:\s*8px/);
    expect(pickerRules).toMatch(/max-height:\s*calc\(100%\s*-\s*16px\)/);
    expect(emojiButtonRules).toMatch(/font-family:\s*"Segoe UI Emoji"/);
    expect(emojiButtonRules).toMatch(/appearance:\s*none/);
  });

  it('keeps the input frame fixed while text, type, and mode change', () => {
    const { container } = renderQuickPlanner();
    const frame = container.querySelector('.quick-planner-compose');
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));
    const initialClassName = frame?.className;
    const initialInlineStyle = frame?.getAttribute('style');
    const frameRules = getCssRules('.quick-planner-compose')[0];

    expect(frameRules).toMatch(/position:\s*relative/);
    expect(frameRules).toMatch(/display:\s*flex/);
    expect(frameRules).toMatch(/width:\s*100%/);
    expect(frameRules).toMatch(/height:\s*calc\(110px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(frameRules).toMatch(/min-height:\s*0/);

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

  it('persists the chosen reminder tag across page remounts', () => {
    const { unmount } = renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    const tags = within(screen.getByRole('group', { name: 'Tags' }));
    expect(tags.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['None', 'Task', 'Meeting', 'Reminder', 'Event', 'Idea']);
    fireEvent.click(tags.getByRole('button', { name: 'Idea' }));

    expect(screen.getByRole('button', { name: 'Change tag: Idea' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tags' })).not.toBeInTheDocument();
    unmount();

    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
    expect(screen.getByRole('button', { name: 'Change tag: Idea' })).toBeInTheDocument();
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
      .find((rules) => /translate\(-28px,\s*23px\)/.test(rules));
    const compactUpcomingColumnRules = getCssRules('.quick-planner-upcoming-column')
      .find((rules) => /height:\s*390px/.test(rules));
    const upcomingRules = getCssRules('.quick-planner-upcoming');
    const desktopUpcomingRules = upcomingRules.find((rules) => /padding:\s*14px\s+14px\s+0/.test(rules));
    const reminderListRules = getCssRules('.quick-planner-reminder-list')[0];
    const reminderScrollAreaRules = getCssRules('.quick-planner-reminder-scroll-area')[0];
    const composeRules = getCssRules('.quick-planner-compose')[0];

    expect(layoutRules).toMatch(/width:\s*min\(100%,\s*1460px\)/);
    expect(plannerStyles).toContain('@media (min-width: 701px) and (max-width: 1200px)');
    expect(layoutRules).toMatch(/margin:\s*0\s+auto/);
    expect(layoutRules).toMatch(/grid-template-areas:\s*"editor upcoming"\s*"editor sidebar"/);
    expect(layoutRules).toMatch(/grid-template-columns:\s*minmax\(0,\s*1\.7fr\)\s*minmax\(280px,\s*360px\)/);
    expect(layoutRules).toMatch(/gap:\s*18px/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/min-height:\s*190px/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/padding:\s*12px\s+14px/);
    expect(sidebarRules).toMatch(/transform:\s*translate\(-28px,\s*23px\)/);
    expect(upcomingColumnRules).toMatch(/transform:\s*translate\(-28px,\s*23px\)/);
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
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/margin:\s*3px\s+-4px/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/padding:\s*7px\s+9px/);
    expect(getCssRules('.quick-planner-draft')[0]).toMatch(/gap:\s*3px/);
    expect(getCssRules('.quick-planner-draft > span')[0]).toMatch(/font-size:\s*14px/);
    expect(getCssRules('.quick-planner-draft > span')[0]).toMatch(/-webkit-line-clamp:\s*1/);
    expect(getCssRules('.quick-planner-draft-scrollbar')[0]).toMatch(/right:\s*-12px/);
    expect(reminderListRules).toMatch(/scrollbar-width:\s*none/);
    expect(editorRules).toMatch(/grid-area:\s*editor/);
    expect(editorRules).toMatch(/transform:\s*translateX\(-35px\)/);
    expect(editorRules).toMatch(/width:\s*calc\(min\(100%,\s*760px\)\s*\+\s*40px\)/);
    expect(editorRules).toMatch(/height:\s*489px/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-clock')[0]).toMatch(/top:\s*17px/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-clock')[0]).toMatch(/left:\s*14px/);
    expect(composeRules).toMatch(/position:\s*relative/);
    expect(composeRules).toMatch(/width:\s*100%/);
    expect(composeRules).toMatch(/height:\s*calc\(110px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(getCssRules('.quick-planner-send')[0]).toMatch(/flex:\s*0 0 38px/);
  });

  it('resets the desktop offsets and stretches the editor on narrow screens', () => {
    const layoutRules = getCssRules('.quick-planner-layout');
    const editorRules = getCssRules('.quick-planner-editor');
    const composeRules = getCssRules('.quick-planner-compose');
    const mobileLayoutRules = layoutRules.find((rules) => /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(rules));
    const mobileEditorRules = editorRules.find((rules) => /height:\s*auto/.test(rules) && /transform:\s*none/.test(rules));
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
    expect(mobileComposeRules).toMatch(/min-height:\s*calc\(110px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
    expect(mobileComposeRules).toMatch(/transform:\s*translateY\(calc\(0px\s*-\s*var\(--quick-planner-resize-half-height,\s*0px\)\)\)/);
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

  it('wraps schedule controls inside the composer at narrow widths', () => {
    const footerRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-compose-footer')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));
    const toolsRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-tools')
      .find((rules) => /width:\s*100%/.test(rules));
    const quickValuesRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /flex:\s*1\s+1\s+100%/.test(rules));
    const composeRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-compose')
      .find((rules) => /height:\s*auto/.test(rules));

    expect(footerRules).toMatch(/flex-wrap:\s*wrap/);
    expect(toolsRules).toMatch(/width:\s*100%/);
    expect(quickValuesRules).toMatch(/width:\s*100%/);
    expect(composeRules).toMatch(/min-height:\s*calc\(110px\s*\+\s*var\(--quick-planner-resize-height,\s*0px\)\)/);
  });

  it('places compact-desktop quick schedule choices below date and time', () => {
    const actionRules = getCssRules('.quick-planner-editor > .quick-planner-heading-actions')
      .find((rules) => /right:\s*8px/.test(rules));
    const scheduleControlsRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-controls')
      .find((rules) => /flex:\s*1\s+1\s+100%/.test(rules));
    const quickValuesRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-schedule-quick-values')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));
    const footerRules = getCssRules('.quick-planner-page[data-publish-mode="schedule"] .quick-planner-compose-footer')
      .find((rules) => /flex-wrap:\s*wrap/.test(rules));

    expect(actionRules).toMatch(/right:\s*8px/);
    expect(scheduleControlsRules).toMatch(/flex:\s*1\s+1\s+100%/);
    expect(quickValuesRules).toMatch(/overflow:\s*visible/);
    expect(footerRules).toMatch(/flex-wrap:\s*wrap/);
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
});

describe('QuickPlannerPage action mode', () => {
  it('shows Send now, Schedule, and Draft in the top action mode selector', () => {
    renderQuickPlanner();
    const modes = within(screen.getByRole('group', { name: 'Action mode' }))
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(modes).toEqual(['Send now', 'Schedule', 'Draft']);
    const quickNavigation = within(screen.getByRole('navigation', { name: 'Workspace navigation' }));
    const navigationButtons = quickNavigation.getAllByRole('button');
    expect(navigationButtons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Studio', 'Posts', 'Settings']);
    expect(navigationButtons.filter((button) => button.classList.contains('is-active'))).toHaveLength(0);
    expect(navigationButtons[0]).not.toHaveAttribute('aria-current');
    expect(quickNavigation.queryByRole('button', { name: 'Quick Plan' })).not.toBeInTheDocument();
  });

  it('labels the lower-right planner panel Draft with a lightning icon', () => {
    const { container } = renderQuickPlanner();

    expect(container.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('Draft');
    expect(container.querySelector('.quick-planner-upcoming-heading .lucide-zap')).toBeInTheDocument();
    expect(screen.getByText('Thoughts & Studio')).toBeInTheDocument();
    expect(container.querySelector('.quick-planner-upcoming-dot')).not.toBeInTheDocument();
  });

  it('pluralizes the Draft heading when at least two drafts are saved', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify([
      { id: 'draft-one', message: 'First draft', attachments: [], entities: [], reminderType: null, savedAt: '' },
      { id: 'draft-two', message: 'Second draft', attachments: [], entities: [], reminderType: null, savedAt: '' },
    ]));
    const { container } = renderQuickPlanner();

    expect(container.querySelector('.quick-planner-upcoming-heading')?.textContent).toContain('Drafts');
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
    expect(getCssRules('.quick-planner-draft.is-selected')[0]).not.toMatch(/inset 3px 0/);
    expect(thumbRules).toMatch(/cursor:\s*grab/);
    expect(activeThumbRules).toMatch(/cursor:\s*grabbing/);
  });

  it('drags the custom hand scrollbar to scroll through drafts', () => {
    const { container } = renderQuickPlanner();
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
    expect(screen.getAllByText('Send now')).toHaveLength(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(onSaveDraft).toHaveBeenCalledWith('A note to keep', ['C:/drafts/reference.pdf'], [{ type: 'bold', offset: 0, length: 1 }], 'task');
    expect(screen.getByRole('textbox', { name: 'Reminder text' })).toHaveValue('');
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
    expect(screen.getByRole('button', { name: 'Clear reminder text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));

    expect(textField).toHaveValue('');
    expect(onEntitiesChange).toHaveBeenCalledWith([]);
    expect(screen.getByText('0 / 1023')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reminder text' })).not.toBeInTheDocument();
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
    expect(within(emptyRender.container).getByRole('button', { name: 'Open 0 selected drafts in Studio' })).toBeEnabled();
    expect(within(emptyRender.container).queryByRole('status')).not.toBeInTheDocument();
  });

  it('selects a saved draft when its card content is clicked without triggering card actions', () => {
    localStorage.setItem(savedPlannerDraftStorageKey, JSON.stringify({
      message: 'Saved planner note',
      attachments: [],
      entities: [],
      reminderType: null,
    }));
    const { container } = renderQuickPlanner();
    const draftCard = container.querySelector<HTMLElement>('.quick-planner-draft')!;

    fireEvent.click(screen.getByText('Saved draft'));
    expect(within(draftCard).getByRole('checkbox', { name: 'Deselect draft Saved planner note' })).toBeChecked();
    fireEvent.click(screen.getByText('Saved planner note'));
    expect(within(draftCard).getByRole('checkbox', { name: 'Select draft Saved planner note' })).not.toBeChecked();
    fireEvent.click(screen.getByText('Saved planner note'));

    expect(within(draftCard).getByRole('checkbox', { name: 'Deselect draft Saved planner note' })).toBeChecked();
    expect(draftCard).toHaveClass('is-selected');
    fireEvent.click(within(draftCard).getByRole('button', { name: 'Pin draft Saved planner note' }));

    expect(within(draftCard).getByRole('button', { name: 'Unpin draft Saved planner note' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(draftCard).getByRole('checkbox', { name: 'Deselect draft Saved planner note' })).toBeChecked();
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

  it('automatically hides the draft selection hint after three seconds', () => {
    vi.useFakeTimers();
    try {
      renderQuickPlanner();
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

    fireEvent.click(screen.getByRole('button', { name: 'Pin draft First queued note' }));

    const getDraftOrder = () => [...container.querySelectorAll('.quick-planner-draft > span')]
      .map((draft) => draft.textContent);
    expect(getDraftOrder()).toEqual(['First queued note', 'Second queued note']);
    expect(screen.getByRole('button', { name: 'Unpin draft First queued note' })).toHaveAttribute('aria-pressed', 'true');

    const storedDrafts = JSON.parse(localStorage.getItem(savedPlannerDraftStorageKey) || '[]');
    expect(storedDrafts[0]).toMatchObject({ message: 'First queued note', pinned: true });

    unmount();
    const restored = renderQuickPlanner();
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
