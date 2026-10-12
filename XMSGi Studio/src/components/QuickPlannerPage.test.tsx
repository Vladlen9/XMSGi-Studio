import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

function renderQuickPlanner() {
  return render(<LocaleProvider><QuickPlannerPage /></LocaleProvider>);
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

    expect(frameRules).toMatch(/position:\s*absolute/);
    expect(frameRules).toMatch(/top:\s*calc\(50%\s*\+\s*28\.5px\)/);
    expect(frameRules).toMatch(/left:\s*50%/);
    expect(frameRules).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    expect(frameRules).toMatch(/width:\s*92%/);
    expect(frameRules).toMatch(/height:\s*110px/);

    fireEvent.change(textField, { target: { value: 'x'.repeat(500) } });
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);

    fireEvent.click(screen.getByRole('button', { name: 'Open reminder types' }));
    const reminderTypeGroup = within(screen.getByRole('group', { name: 'Reminder type' }));
    fireEvent.click(reminderTypeGroup.getByRole('button', { name: 'Idea' }));
    expect(screen.queryByRole('group', { name: 'Reminder type' })).not.toBeInTheDocument();
    fireEvent.click(modeGroup.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(modeGroup.getByRole('button', { name: 'Draft' }));
    fireEvent.click(modeGroup.getByRole('button', { name: 'Send now' }));
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);

    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);
  });

  it('keeps the planner window and text editor centered at a stable desktop width', () => {
    const layoutRules = getCssRules('.quick-planner-layout');
    const editorRules = getCssRules('.quick-planner-editor');
    const sidebarRules = getCssRules('.quick-planner-sidebar');
    const upcomingRules = getCssRules('.quick-planner-upcoming');
    const composeRules = getCssRules('.quick-planner-compose');

    expect(layoutRules[0]).toMatch(/width:\s*min\(100%,\s*1460px\)/);
    expect(layoutRules[0]).toMatch(/margin:\s*0\s+auto/);
    expect(layoutRules[0]).toMatch(/grid-template-areas:\s*"editor sidebar"\s*"editor upcoming"/);
    expect(layoutRules[0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1\.7fr\)\s*minmax\(280px,\s*360px\)/);
    expect(layoutRules[0]).toMatch(/gap:\s*18px/);
    expect(sidebarRules[0]).toMatch(/height:\s*230px/);
    expect(sidebarRules[0]).toMatch(/overflow:\s*hidden/);
    expect(sidebarRules[0]).toMatch(/padding:\s*14px\s+16px/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-today')[0]).toMatch(/position:\s*absolute/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-today')[0]).toMatch(/top:\s*12px/);
    expect(getCssRules('.quick-planner-editor > .quick-planner-today')[0]).toMatch(/left:\s*14px/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*861px\)\s*and\s*\(max-width:\s*1460px\)\s*\{\s*\.quick-planner-editor > \.quick-planner-today\s*\{\s*left:\s*69px;/);
    expect(editorRules[0]).toMatch(/position:\s*relative/);
    expect(editorRules[0]).toMatch(/justify-self:\s*center/);
    expect(editorRules[0]).toMatch(/border-color:\s*rgba\(var\(--quick-planner-accent\),\s*0\.56\)/);
    expect(editorRules[0]).toMatch(/0 0 0 1px rgba\(var\(--quick-planner-accent\),\s*0\.1\)/);
    expect(editorRules[0]).toMatch(/transition:\s*border-color 180ms ease,\s*box-shadow 180ms ease/);
    expect(editorRules[0]).toMatch(/transform:\s*translateX\(-35px\)/);
    expect(editorRules[0]).toMatch(/width:\s*calc\(min\(100%,\s*760px\)\s*\+\s*40px\)/);
    expect(editorRules[0]).toMatch(/height:\s*449px/);
    expect(editorRules[0]).toMatch(/min-height:\s*0/);
    expect(editorRules[0]).toMatch(/overflow:\s*visible/);
    expect(editorRules[0]).toMatch(/margin-top:\s*43px/);
    expect(editorRules[0]).toMatch(/margin-bottom:\s*-24px/);
    expect(editorRules[0]).toMatch(/padding:\s*22px\s+22px\s+18px/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-editor,\s*\.quick-planner-upcoming\s*\{\s*border:\s*1px solid var\(--quick-planner-border\);\s*border-radius:\s*20px;/);
    expect(getCssRules('.quick-planner-heading-actions')[0]).toMatch(/transform:\s*translateY\(-10px\)/);
    expect(sidebarRules[0]).toMatch(/transform:\s*translate\(-28px,\s*30px\)/);
    expect(sidebarRules[0]).not.toMatch(/margin-top:/);
    const defaultUpcomingRules = upcomingRules.find((rules) => /transform:\s*translate\(-28px,\s*24px\)/.test(rules));
    expect(defaultUpcomingRules).not.toMatch(/margin-bottom:/);
    expect(defaultUpcomingRules).toMatch(/height:\s*220px/);
    expect(defaultUpcomingRules).toMatch(/min-height:\s*0/);
    expect(defaultUpcomingRules).toMatch(/overflow:\s*hidden/);
    expect(composeRules[0]).toMatch(/position:\s*absolute/);
    expect(composeRules[0]).toMatch(/top:\s*calc\(50%\s*\+\s*28\.5px\)/);
    expect(composeRules[0]).toMatch(/left:\s*50%/);
    expect(composeRules[0]).toMatch(/align-self:\s*center/);
    expect(composeRules[0]).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    expect(composeRules[0]).toMatch(/width:\s*92%/);
    expect(composeRules[0]).toMatch(/height:\s*110px/);
    expect(composeRules[0]).toMatch(/border-radius:\s*9px/);
    expect(composeRules[0]).toMatch(/border:\s*1px solid rgba\(var\(--quick-planner-accent\),\s*0\.56\)/);
    expect(composeRules[0]).toMatch(/box-shadow:\s*0 0 0 1px rgba\(var\(--quick-planner-accent\),\s*0\.1\)/);
    expect(composeRules[0]).toMatch(/transition:\s*box-shadow 180ms ease,\s*background-color 180ms ease/);
    expect(getCssRules('.quick-planner-compose-input-row')[0]).toMatch(/flex:\s*1 1 auto/);
    expect(getCssRules('.quick-planner-compose-input-row')[0]).toMatch(/align-items:\s*stretch/);
    expect(getCssRules('.quick-planner-compose-clear-rail')[0]).toMatch(/flex:\s*0 0 40px/);
    expect(getCssRules('.quick-planner-compose-clear-rail')[0]).toMatch(/align-self:\s*stretch/);
    expect(getCssRules('.quick-planner-compose-clear-rail')[0]).not.toMatch(/border-left:/);
    expect(getCssRules('.quick-planner-counter')[0]).toMatch(/margin-right:\s*6px/);
    const sendButtonRules = getCssRules('.quick-planner-send')[0];
    expect(sendButtonRules).toMatch(/flex:\s*0 0 38px/);
    expect(sendButtonRules).toMatch(/box-shadow:\s*0 0 6px rgba\(var\(--quick-planner-accent\),\s*0\.14\)/);
    const narrowElectronLayout = layoutRules.find((rules) => /minmax\(280px,\s*320px\)/.test(rules));
    const narrowElectronEditor = editorRules.find((rules) => /height:\s*449px/.test(rules) && /transform:\s*none/.test(rules));
    expect(narrowElectronLayout).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*320px\)/);
    expect(narrowElectronEditor).toMatch(/justify-self:\s*stretch/);
    expect(narrowElectronEditor).toMatch(/width:\s*100%/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*860px\)\s*\{[\s\S]*?\.quick-planner-mode-switch\s*\{\s*flex-wrap:\s*nowrap;/);
    expect(getCssRules('.quick-planner-mode-switch button').some((rules) => /font-size:\s*13px/.test(rules))).toBe(true);
    expect(plannerStyles).toMatch(/@media\s*\(max-width:\s*700px\)/);
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*1100px\)\s*\{\s*\.quick-planner-upcoming\s*\{\s*transform:\s*none;/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-upcoming\s*\{\s*transform:\s*none;/);
    expect(getCssRules('.quick-planner-section-label')[0]).toMatch(/font-size:\s*9px/);
    const reminderTitleRules = getCssRules('.quick-planner-editor-heading > .quick-planner-section-label')[0];
    expect(reminderTitleRules).toMatch(/display:\s*flex/);
    expect(reminderTitleRules).toMatch(/align-items:\s*center/);
    expect(reminderTitleRules).toMatch(/height:\s*22px/);
    expect(reminderTitleRules).toMatch(/transform:\s*translate\(-16px,\s*-14px\)/);
    expect(reminderTitleRules).toMatch(/font-family:\s*Inter,\s*ui-sans-serif,\s*system-ui,\s*sans-serif/);
    expect(reminderTitleRules).toMatch(/font-size:\s*11px/);
    expect(reminderTitleRules).toMatch(/font-weight:\s*400/);
    expect(reminderTitleRules).toMatch(/letter-spacing:\s*0\.16em/);
    expect(reminderTitleRules).toMatch(/line-height:\s*normal/);
    expect(getCssRules('.quick-planner-mode-caption')[0]).toMatch(/font-size:\s*10px/);
    expect(getCssRules('.quick-planner-mode-switch button')[0]).toMatch(/font-size:\s*22px/);
    expect(getCssRules('.quick-planner-compose textarea')[0]).toMatch(/min-height:\s*28px/);
    expect(getCssRules('.quick-planner-compose textarea')[0]).toMatch(/overflow-y:\s*auto/);
    expect(getCssRules('.quick-planner-compose textarea')[0]).toMatch(/font-size:\s*13px/);
    const typeControlsRules = getCssRules('.quick-planner-type-controls')[0];
    expect(typeControlsRules).toMatch(/position:\s*absolute/);
    expect(typeControlsRules).toMatch(/bottom:\s*calc\(50%\s*\+\s*26\.5px\)/);
    expect(typeControlsRules).toMatch(/display:\s*flex/);
    expect(typeControlsRules).toMatch(/height:\s*26px/);
    expect(typeControlsRules).toMatch(/gap:\s*4px/);
    const selectedTypeRules = getCssRules('.quick-planner-selected-type')[0];
    expect(selectedTypeRules).toMatch(/height:\s*26px/);
    expect(selectedTypeRules).toMatch(/flex:\s*0 0 auto/);
    expect(selectedTypeRules).toMatch(/width:\s*max-content/);
    expect(selectedTypeRules).toMatch(/max-width:\s*calc\(100%\s*-\s*32px\)/);
    expect(selectedTypeRules).not.toMatch(/position:\s*absolute/);
    expect(getCssRules('.quick-planner-type-toggle')[0]).toMatch(/color:\s*#8a9aa7/);
    expect(getCssRules('.quick-planner-type-toggle')[0]).toMatch(/background:\s*transparent/);
    expect(getCssRules('.quick-planner-type-toggle')[0]).toMatch(/flex:\s*0 0 24px/);
    expect(plannerStyles).toMatch(/\.quick-planner-type-toggle:hover,\s*\.quick-planner-type-toggle:focus-visible\s*\{[^}]*box-shadow:/);
    const reminderTypeRules = getCssRules('.quick-planner-reminder-types')[0];
    expect(reminderTypeRules).toMatch(/width:\s*max-content/);
    expect(reminderTypeRules).toMatch(/max-width:\s*calc\(100%\s*-\s*124px\)/);
    expect(reminderTypeRules).toMatch(/overflow-x:\s*auto/);
    expect(reminderTypeRules).toMatch(/flex-wrap:\s*nowrap/);
    expect(getCssRules('.quick-planner-reminder-types button')[0]).toMatch(/height:\s*24px/);
    expect(getCssRules('.quick-planner-reminder-types button')[0]).toMatch(/font-size:\s*11px/);
    expect(getCssRules('.quick-planner-reminder-types button')[0]).toMatch(/width:\s*auto/);
    expect(getCssRules('.quick-planner-reminder-types button.is-selected')[0]).toMatch(/background:\s*var\(--quick-planner-accent-soft\)/);
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
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-editor,\s*\.quick-planner-upcoming\s*\{\s*grid-area:\s*auto;\s*margin:\s*0;/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar\s*\{\s*height:\s*auto;/);
    expect(plannerStyles).toMatch(/\.quick-planner-editor > \.quick-planner-type-controls\s*\{\s*position:\s*static;\s*align-self:\s*stretch;/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-upcoming\s*\{\s*transform:\s*none;/);
    expect(plannerStyles).toMatch(/\.quick-planner-upcoming\s*\{\s*height:\s*auto;\s*overflow:\s*visible;/);
    expect(mobileEditorRules).toMatch(/height:\s*auto/);
    expect(mobileEditorRules).toMatch(/overflow:\s*visible/);
    expect(mobileComposeRules).toMatch(/width:\s*100%/);
    expect(mobileComposeRules).toMatch(/min-width:\s*0/);
    expect(mobileComposeRules).toMatch(/height:\s*auto/);
    expect(plannerStyles).toMatch(/\.quick-planner-heading-actions\s*\{\s*transform:\s*none;/);
    expect(mobileComposeRules).toMatch(/position:\s*static/);
    expect(mobileComposeRules).toMatch(/flex:\s*1 1 auto/);
    expect(mobileComposeRules).toMatch(/min-height:\s*110px/);
    expect(mobileComposeRules).toMatch(/transform:\s*none/);
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
    const tools = container.querySelector('.quick-planner-tools');
    const selectedTypeStatus = container.querySelector('.quick-planner-selected-type');
    const typeToggle = screen.getByRole('button', { name: 'Open reminder types' });

    expect(container.querySelector('.quick-planner-compose-input-row svg')).not.toBeInTheDocument();
    expect(container.querySelector('.quick-planner-editor')).toContainElement(selectedTypeStatus as HTMLElement);
    expect(container.querySelector('.quick-planner-compose')).not.toContainElement(selectedTypeStatus as HTMLElement);
    expect(selectedTypeStatus).not.toContainElement(typeToggle);
    expect(typeToggle.querySelector('svg')).toHaveClass('lucide-plus');
    expect(Array.from((tools as HTMLElement).children).map((child) => child.getAttribute('aria-label')))
      .toEqual(['Add emoji', 'Add attachment', 'Text options']);
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(typeToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Reminder type' })).not.toBeInTheDocument();
    expect(container.querySelector('.quick-planner-type-controls')?.lastElementChild).toBe(typeToggle);
    expect(screen.queryByRole('button', { name: 'Silent sending' })).not.toBeInTheDocument();

    fireEvent.click(typeToggle);
    expect(screen.getByRole('button', { name: 'Close reminder types' }).querySelector('svg')).toHaveClass('lucide-x');
    const reminderTypeGroup = within(screen.getByRole('group', { name: 'Reminder type' }));
    expect(container.querySelector('.quick-planner-type-controls')).toContainElement(reminderTypeGroup.getByRole('button', { name: 'Meeting' }));
    expect(container.querySelector('.quick-planner-compose')).not.toContainElement(reminderTypeGroup.getByRole('button', { name: 'Meeting' }));
    expect(container.querySelector('.quick-planner-type-controls')?.lastElementChild).toHaveAccessibleName('Close reminder types');
    expect(reminderTypeGroup.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['Meeting', 'Reminder', 'Event', 'Idea']);
    expect(reminderTypeGroup.queryByRole('button', { name: 'Task' })).not.toBeInTheDocument();
    fireEvent.click(reminderTypeGroup.getByRole('button', { name: 'Idea' }));
    expect(screen.queryByRole('group', { name: 'Reminder type' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open reminder types' })).toHaveAttribute('aria-expanded', 'false');
    expect(selectedTypeStatus).toHaveTextContent('Idea');
    fireEvent.click(screen.getByRole('button', { name: 'Open reminder types' }));
    const updatedReminderTypes = within(screen.getByRole('group', { name: 'Reminder type' }));
    expect(updatedReminderTypes.queryByRole('button', { name: 'Idea' })).not.toBeInTheDocument();
    expect(updatedReminderTypes.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['Task', 'Meeting', 'Reminder', 'Event']);
    fireEvent.click(screen.getByRole('button', { name: 'Close reminder types' }));
    expect(screen.queryByRole('button', { name: 'Clear reminder text' })).not.toBeInTheDocument();
    expect(textField).toHaveAttribute('maxLength', '500');
    fireEvent.change(textField, { target: { value: 'Call the dentist' } });

    expect(screen.getByText('16 / 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear reminder text' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));

    expect(textField).toHaveValue('');
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
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