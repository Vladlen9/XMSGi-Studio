import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { QuickPlannerPage } from './QuickPlannerPage';

function renderQuickPlanner() {
  return render(<LocaleProvider><QuickPlannerPage /></LocaleProvider>);
}

describe('QuickPlannerPage action mode', () => {
  it('starts in Send now mode without connecting an action', () => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', 'send');
    expect(modeGroup.getByRole('button', { name: 'Send now' })).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.getByRole('button', { name: 'Schedule' })).toHaveAttribute('aria-pressed', 'false');
    expect(modeGroup.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'false');
    expect(modeGroup.getByText('Current action')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date, 12 / 10 / 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Time, 09 : 30' })).toBeInTheDocument();
    expect(screen.getAllByText('Send now')).toHaveLength(1);
    expect(container.querySelector('.quick-planner-repeat')).toBeInTheDocument();
  });

  it('tracks reminder text and clears it from the editor', () => {
    renderQuickPlanner();
    const textField = screen.getByRole('textbox', { name: 'Reminder text' });

    expect(textField).toHaveAttribute('maxLength', '500');
    fireEvent.change(textField, { target: { value: 'Call the dentist' } });

    expect(screen.getByText('16 / 500')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear reminder text' }));

    expect(textField).toHaveValue('');
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('toggles silent sending independently from the action mode', () => {
    renderQuickPlanner();
    const silentButton = screen.getByRole('button', { name: 'Silent sending' });

    expect(silentButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(silentButton);

    expect(silentButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Send now' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['Schedule', 'schedule'],
    ['Draft', 'draft'],
  ])('selecting %s only updates the visual mode', (label, mode) => {
    const { container } = renderQuickPlanner();
    const modeGroup = within(screen.getByRole('group', { name: 'Action mode' }));

    fireEvent.click(modeGroup.getByRole('button', { name: label }));

    expect(container.querySelector('.quick-planner-page')).toHaveAttribute('data-publish-mode', mode);
    expect(modeGroup.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(modeGroup.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(modeGroup.getAllByText(label)).toHaveLength(1);
    expect(container.querySelector('.quick-planner-repeat-slot')).toBeInTheDocument();
    if (mode === 'draft') {
      expect(container.querySelector('.quick-planner-repeat')).not.toBeInTheDocument();
    } else {
      expect(container.querySelector('.quick-planner-repeat')).toBeInTheDocument();
    }
  });
});