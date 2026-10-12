import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { QuickPlannerPage } from './QuickPlannerPage';

const plannerStyles = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'QuickPlannerPage.css'),
  'utf8',
);

function getCssRules(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...plannerStyles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map(([, declarations]) => declarations);
}

function renderQuickPlanner(overrides: Partial<ComponentProps<typeof QuickPlannerPage>> = {}) {
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
    onCancelScheduled: vi.fn(),
    ...overrides,
  };
  const Harness = () => {
    const [message, setMessage] = useState(props.message);
    const [entities, setEntities] = useState(props.entities);
    const [attachments, setAttachments] = useState(props.attachments);
    return (
      <LocaleProvider>
        <QuickPlannerPage
          {...props}
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
  return render(<Harness />);
}

describe('QuickPlannerPage layout positioning', () => {
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

  it('offers reminder tags in Draft mode and keeps the chosen tag', () => {
    renderQuickPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Action mode' })).getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    const tags = within(screen.getByRole('group', { name: 'Tags' }));
    expect(tags.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['None', 'Task', 'Meeting', 'Reminder', 'Event', 'Idea']);
    fireEvent.click(tags.getByRole('button', { name: 'Idea' }));

    expect(screen.getByRole('button', { name: 'Change tag: Idea' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tags' })).not.toBeInTheDocument();
  });

  it('keeps the planner window and text editor centered at a stable desktop width', () => {
    const layoutRules = getCssRules('.quick-planner-layout')[0];
    const editorRules = getCssRules('.quick-planner-editor')[0];
    const composeRules = getCssRules('.quick-planner-compose')[0];

    expect(layoutRules).toMatch(/width:\s*min\(100%,\s*1460px\)/);
    expect(layoutRules).toMatch(/margin:\s*0\s+auto/);
    expect(layoutRules).toMatch(/grid-template-areas:\s*"editor sidebar"\s*"editor upcoming"/);
    expect(layoutRules).toMatch(/grid-template-columns:\s*minmax\(0,\s*1\.7fr\)\s*minmax\(280px,\s*360px\)/);
    expect(layoutRules).toMatch(/gap:\s*18px/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/height:\s*230px/);
    expect(getCssRules('.quick-planner-sidebar')[0]).toMatch(/padding:\s*14px\s+16px/);
    expect(editorRules).toMatch(/grid-area:\s*editor/);
    expect(editorRules).toMatch(/transform:\s*translateX\(-35px\)/);
    expect(editorRules).toMatch(/width:\s*calc\(min\(100%,\s*760px\)\s*\+\s*40px\)/);
    expect(editorRules).toMatch(/height:\s*449px/);
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
});

describe('QuickPlannerPage action mode', () => {
  it('shows Send now, Schedule, and Draft in the top action mode selector', () => {
    renderQuickPlanner();
    const modes = within(screen.getByRole('group', { name: 'Action mode' }))
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(modes).toEqual(['Send now', 'Schedule', 'Draft']);
    const quickCategories = within(screen.getByRole('navigation', { name: 'Quick Plan categories' }));
    expect(quickCategories.getAllByRole('button').map((button) => button.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['All tasks7', 'Today3', 'This week12', 'Archive24']);
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

  it('tracks reminder text and clears it from the editor', () => {
    const { container } = renderQuickPlanner();
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });
    expect(textField).toHaveAttribute('maxLength', '1023');
    fireEvent.change(textField, { target: { value: 'Call the dentist' } });

    expect(screen.getByText('16 / 1023')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear reminder text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));

    expect(textField).toHaveValue('');
    expect(screen.getByText('0 / 1023')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear reminder text' })).not.toBeInTheDocument();
  });

  it.each([
    ['Schedule', 'schedule'],
    ['Draft', 'draft'],
  ])('selecting %s only updates the visual mode', (label, mode) => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    fireEvent.click(modeGroup.getByRole('button', { name: label }));

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', mode);
    expect(screen.getByRole('navigation', { name: 'Reminder views' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Quick Plan categories' })).not.toBeInTheDocument();
    expect(modeGroup.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(modeGroup.getAllByText(label)).toHaveLength(1);
    const actionButtonName = mode === 'schedule' ? 'Schedule reminder' : 'Save draft';
    const actionIconClass = mode === 'schedule' ? 'lucide-calendar-days' : 'lucide-file-text';
    expect(screen.getByRole('button', { name: actionButtonName }).querySelector('svg')).toHaveClass(actionIconClass);
    expect(container.querySelector('.quick-planner-date-time')).not.toBeInTheDocument();
  });
});