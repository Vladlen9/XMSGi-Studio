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
    const reminderTypeGroup = within(screen.getByRole('group', { name: 'Reminder type' }));
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));
    const initialClassName = frame?.className;
    const initialInlineStyle = frame?.getAttribute('style');
    const frameRules = getCssRules('.quick-planner-compose')[0];

    expect(frameRules).toMatch(/position:\s*absolute/);
    expect(frameRules).toMatch(/top:\s*50%/);
    expect(frameRules).toMatch(/left:\s*50%/);
    expect(frameRules).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    expect(frameRules).toMatch(/width:\s*92%/);
    expect(frameRules).toMatch(/height:\s*110px/);

    fireEvent.change(textField, { target: { value: 'x'.repeat(500) } });
    expect(frame?.className).toBe(initialClassName);
    expect(frame?.getAttribute('style')).toBe(initialInlineStyle);

    fireEvent.click(reminderTypeGroup.getByRole('button', { name: 'Idea' }));
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
    expect(sidebarRules[0]).toMatch(/height:\s*260px/);
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
    expect(editorRules[0]).toMatch(/margin-top:\s*43px/);
    expect(editorRules[0]).toMatch(/margin-bottom:\s*-11px/);
    expect(editorRules[0]).toMatch(/padding:\s*22px\s+22px\s+18px/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-editor,\s*\.quick-planner-upcoming\s*\{\s*border:\s*1px solid var\(--quick-planner-border\);\s*border-radius:\s*20px;/);
    expect(getCssRules('.quick-planner-heading-actions')[0]).toMatch(/transform:\s*translateY\(-10px\)/);
    expect(sidebarRules[0]).toMatch(/transform:\s*translate\(-28px,\s*30px\)/);
    expect(sidebarRules[0]).not.toMatch(/margin-top:/);
    expect(upcomingRules[1]).toMatch(/transform:\s*translate\(-28px,\s*24px\)/);
    expect(upcomingRules[1]).not.toMatch(/margin-bottom:/);
    expect(composeRules[0]).toMatch(/position:\s*absolute/);
    expect(composeRules[0]).toMatch(/top:\s*50%/);
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
    expect(plannerStyles).toMatch(/@media\s*\(min-width:\s*861px\)\s*and\s*\(max-width:\s*980px\)\s*\{\s*\.quick-planner-compose\s*\{\s*left:\s*calc\(50%\s*\+\s*30px\);\s*width:\s*calc\(92%\s*-\s*5px\);/);
    expect(plannerStyles).toMatch(/\.quick-planner-editor > \.quick-planner-selected-type\s*\{\s*left:\s*calc\(4%\s*\+\s*43px\);/);
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
    const selectedTypeRules = getCssRules('.quick-planner-selected-type')[0];
    expect(selectedTypeRules).toMatch(/position:\s*absolute/);
    expect(selectedTypeRules).toMatch(/height:\s*26px/);
    expect(selectedTypeRules).toMatch(/top:\s*calc\(50%\s*-\s*55px\)/);
    expect(selectedTypeRules).toMatch(/transform:\s*translateY\(-100%\)/);
    expect(getCssRules('.quick-planner-reminder-types')[0]).toMatch(/overflow-x:\s*auto/);
    expect(getCssRules('.quick-planner-reminder-types button')[0]).toMatch(/height:\s*24px/);
    expect(getCssRules('.quick-planner-reminder-types button')[0]).toMatch(/font-size:\s*11px/);
    expect(getCssRules('.quick-planner-tools .quick-planner-reminder-types button')[0]).toMatch(/width:\s*auto/);
    expect(getCssRules('.quick-planner-reminder-types button.is-selected')[0]).toMatch(/background:\s*var\(--quick-planner-accent-soft\)/);
  });

  it('resets the desktop offsets and stretches the editor on narrow screens', () => {
    const editorRules = getCssRules('.quick-planner-editor');

    expect(editorRules[1]).toMatch(/justify-self:\s*stretch/);
    expect(editorRules[1]).toMatch(/width:\s*calc\(100%\s*-\s*10px\)/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-editor,\s*\.quick-planner-upcoming\s*\{\s*grid-area:\s*auto;\s*margin:\s*0;/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar\s*\{\s*height:\s*auto;/);
    expect(plannerStyles).toMatch(/\.quick-planner-editor > \.quick-planner-selected-type\s*\{\s*position:\s*static;\s*align-self:\s*flex-start;/);
    expect(plannerStyles).toMatch(/\.quick-planner-sidebar,\s*\.quick-planner-upcoming\s*\{\s*transform:\s*none;/);
    expect(plannerStyles).toMatch(/\.quick-planner-heading-actions\s*\{\s*transform:\s*none;/);
    expect(plannerStyles).toMatch(/\.quick-planner-compose\s*\{\s*position:\s*static;\s*flex:\s*1 1 auto;\s*height:\s*auto;\s*min-height:\s*110px;\s*transform:\s*none;/);
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

    expect(container.querySelector('.quick-planner-compose-input-row svg')).not.toBeInTheDocument();
    expect(container.querySelector('.quick-planner-editor')).toContainElement(selectedTypeStatus as HTMLElement);
    expect(container.querySelector('.quick-planner-compose')).not.toContainElement(selectedTypeStatus as HTMLElement);
    expect(Array.from((tools as HTMLElement).children).map((child) => child.getAttribute('aria-label')))
      .toEqual(['Add emoji', 'Add attachment', 'Text options', 'Reminder type']);
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    const reminderTypeGroup = within(screen.getByRole('group', { name: 'Reminder type' }));
    expect(reminderTypeGroup.getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['Task', 'Meeting', 'Reminder', 'Event', 'Idea']);
    expect(screen.queryByRole('button', { name: 'Silent sending' })).not.toBeInTheDocument();
    expect(reminderTypeGroup.getByRole('button', { name: 'Task' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(reminderTypeGroup.getByRole('button', { name: 'Idea' }));
    expect(reminderTypeGroup.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');
    expect(selectedTypeStatus).toHaveTextContent('Idea');
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
    expect(container.querySelector('.quick-planner-date-time')).not.toBeInTheDocument();
  });
});